import { randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app.js';
import { createPool, type Db } from '../src/db/pool.js';
import { testConfig, TEST_DATABASE_URL } from './test-env.js';

export const ORIGIN = 'http://localhost:5107';
export const PASSWORD = 'correct horse battery staple';

export interface TestContext {
  readonly app: FastifyInstance;
  readonly db: Db;
  close(): Promise<void>;
}

export async function createTestContext(
  overrides: Record<string, string> = {},
): Promise<TestContext> {
  const db = createPool(TEST_DATABASE_URL, 5);
  const app = await buildApp({ config: testConfig(overrides), db });
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

/** A signed-in client that replays cookies and the CSRF header like the browser does. */
export interface Client {
  readonly cookie: string;
  readonly csrf: string;
  readonly email: string;
  readonly organizationId: string;
  request(method: string, url: string, body?: unknown): Promise<LightMyRequestResponse>;
}

export function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export function clientFrom(
  app: FastifyInstance,
  response: LightMyRequestResponse,
  email: string,
): Client {
  const body = response.json();
  const cookie = cookieHeader(response);
  const csrf = body.data.csrfToken as string;
  return {
    cookie,
    csrf,
    email,
    organizationId: body.data.organization.id,
    request: (method, url, payload) =>
      app.inject({
        method: method as 'GET',
        url,
        headers: { cookie, 'x-csrf-token': csrf, origin: ORIGIN },
        ...(payload === undefined ? {} : { payload: payload as object }),
      }),
  };
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function registerClient(app: FastifyInstance, orgName = 'Test Org'): Promise<Client> {
  const email = uniqueEmail();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { origin: ORIGIN },
    payload: { organizationName: orgName, displayName: 'Tester', email, password: PASSWORD },
  });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  return clientFrom(app, response, email);
}

/** Adds a user with the given role to the client's organization and signs them in. */
export async function addMember(
  ctx: TestContext,
  owner: Client,
  role: 'admin' | 'editor' | 'viewer',
): Promise<Client> {
  const { hashPassword } = await import('../src/modules/auth/password.js');
  const email = uniqueEmail(role);
  const { rows } = await ctx.db.query<{ id: string }>(
    'INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [email, role, await hashPassword(PASSWORD)],
  );
  await ctx.db.query(
    'INSERT INTO memberships (organization_id, user_id, role) VALUES ($1, $2, $3)',
    [owner.organizationId, rows[0]!.id, role],
  );
  const login = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    payload: { email, password: PASSWORD },
  });
  return clientFrom(ctx.app, login, email);
}
