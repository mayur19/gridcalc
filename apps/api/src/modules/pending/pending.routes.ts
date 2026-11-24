import type { FastifyInstance } from 'fastify';
import { sendNotImplemented } from '../../http/not-implemented.js';

/**
 * Registered-but-pending endpoints. They keep the live API surface identical to
 * docs/api/openapi.yaml (operations marked `x-status: pending`) and answer 501 with the
 * backlog ticket that will implement them. Authentication still applies.
 */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PendingRoute {
  readonly method: Method;
  readonly url: string;
  readonly ticket: string;
  readonly summary: string;
}

const WB = '/api/v1/workbooks/:workbookId';
const SHEET = `${WB}/sheets/:sheetId`;

export const PENDING_ROUTES: readonly PendingRoute[] = [
  // Workbook & sheet management
  { method: 'PATCH', url: WB, ticket: 'GC-043', summary: 'Renaming a workbook' },
  { method: 'DELETE', url: WB, ticket: 'GC-043', summary: 'Deleting a workbook' },
  { method: 'POST', url: `${WB}/duplicate`, ticket: 'GC-043', summary: 'Duplicating a workbook' },
  { method: 'PATCH', url: SHEET, ticket: 'GC-044', summary: 'Renaming or reordering a sheet' },
  { method: 'DELETE', url: SHEET, ticket: 'GC-044', summary: 'Deleting a sheet' },
  // Structural edits with reference rewriting
  { method: 'POST', url: `${SHEET}/rows/insert`, ticket: 'GC-060', summary: 'Inserting rows' },
  { method: 'POST', url: `${SHEET}/rows/delete`, ticket: 'GC-060', summary: 'Deleting rows' },
  {
    method: 'POST',
    url: `${SHEET}/columns/insert`,
    ticket: 'GC-061',
    summary: 'Inserting columns',
  },
  { method: 'POST', url: `${SHEET}/columns/delete`, ticket: 'GC-061', summary: 'Deleting columns' },
  { method: 'POST', url: `${SHEET}/move-range`, ticket: 'GC-062', summary: 'Moving a range' },
  {
    method: 'PUT',
    url: `${SHEET}/dimensions`,
    ticket: 'GC-053',
    summary: 'Column widths and row heights',
  },
  // Formatting
  { method: 'GET', url: `${SHEET}/formats`, ticket: 'GC-064', summary: 'Reading cell formats' },
  { method: 'PUT', url: `${SHEET}/formats`, ticket: 'GC-064', summary: 'Applying cell formats' },
  {
    method: 'GET',
    url: `${SHEET}/conditional-formats`,
    ticket: 'GC-066',
    summary: 'Listing conditional formats',
  },
  {
    method: 'POST',
    url: `${SHEET}/conditional-formats`,
    ticket: 'GC-066',
    summary: 'Creating a conditional format',
  },
  {
    method: 'GET',
    url: `${SHEET}/validations`,
    ticket: 'GC-067',
    summary: 'Listing data validation rules',
  },
  {
    method: 'POST',
    url: `${SHEET}/validations`,
    ticket: 'GC-067',
    summary: 'Creating a data validation rule',
  },
  { method: 'POST', url: `${SHEET}/merges`, ticket: 'GC-068', summary: 'Merging cells' },
  // Sort & filter
  { method: 'POST', url: `${SHEET}/sort`, ticket: 'GC-074', summary: 'Sorting a range' },
  { method: 'GET', url: `${SHEET}/filter`, ticket: 'GC-075', summary: 'Reading the sheet filter' },
  { method: 'PUT', url: `${SHEET}/filter`, ticket: 'GC-075', summary: 'Setting the sheet filter' },
  // Named ranges
  { method: 'GET', url: `${WB}/named-ranges`, ticket: 'GC-028', summary: 'Listing named ranges' },
  {
    method: 'POST',
    url: `${WB}/named-ranges`,
    ticket: 'GC-028',
    summary: 'Defining a named range',
  },
  {
    method: 'PATCH',
    url: `${WB}/named-ranges/:nameId`,
    ticket: 'GC-028',
    summary: 'Updating a named range',
  },
  {
    method: 'DELETE',
    url: `${WB}/named-ranges/:nameId`,
    ticket: 'GC-028',
    summary: 'Deleting a named range',
  },
  // Editing productivity
  {
    method: 'POST',
    url: `${WB}/paste`,
    ticket: 'GC-071',
    summary: 'Paste with reference adjustment',
  },
  { method: 'POST', url: `${WB}/fill`, ticket: 'GC-073', summary: 'Autofill' },
  { method: 'POST', url: `${WB}/undo`, ticket: 'GC-070', summary: 'Undo' },
  { method: 'POST', url: `${WB}/redo`, ticket: 'GC-070', summary: 'Redo' },
  { method: 'POST', url: `${WB}/find-replace`, ticket: 'GC-057', summary: 'Find and replace' },
  // Dependency tracing
  {
    method: 'GET',
    url: `${SHEET}/cells/:row/:col/precedents`,
    ticket: 'GC-049',
    summary: 'Tracing precedents',
  },
  {
    method: 'GET',
    url: `${SHEET}/cells/:row/:col/dependents`,
    ticket: 'GC-049',
    summary: 'Tracing dependents',
  },
  {
    method: 'GET',
    url: `${SHEET}/cells/:row/:col/history`,
    ticket: 'GC-096',
    summary: 'Cell edit history',
  },
  // Pivot tables & charts
  { method: 'GET', url: `${WB}/pivots`, ticket: 'GC-077', summary: 'Listing pivot tables' },
  { method: 'POST', url: `${WB}/pivots`, ticket: 'GC-077', summary: 'Creating a pivot table' },
  {
    method: 'PATCH',
    url: `${WB}/pivots/:pivotId`,
    ticket: 'GC-078',
    summary: 'Updating a pivot table',
  },
  {
    method: 'DELETE',
    url: `${WB}/pivots/:pivotId`,
    ticket: 'GC-078',
    summary: 'Deleting a pivot table',
  },
  {
    method: 'POST',
    url: `${WB}/pivots/:pivotId/refresh`,
    ticket: 'GC-078',
    summary: 'Refreshing a pivot table',
  },
  { method: 'GET', url: `${WB}/charts`, ticket: 'GC-080', summary: 'Listing charts' },
  { method: 'POST', url: `${WB}/charts`, ticket: 'GC-080', summary: 'Creating a chart' },
  { method: 'PATCH', url: `${WB}/charts/:chartId`, ticket: 'GC-081', summary: 'Updating a chart' },
  { method: 'DELETE', url: `${WB}/charts/:chartId`, ticket: 'GC-081', summary: 'Deleting a chart' },
  // Import / export
  {
    method: 'POST',
    url: '/api/v1/imports',
    ticket: 'GC-083',
    summary: 'Importing CSV / XLSX-lite files',
  },
  {
    method: 'GET',
    url: '/api/v1/imports/:importId',
    ticket: 'GC-087',
    summary: 'Import job status',
  },
  { method: 'GET', url: `${WB}/export`, ticket: 'GC-084', summary: 'Exporting a workbook' },
  // Collaboration
  {
    method: 'GET',
    url: `${WB}/live`,
    ticket: 'GC-088',
    summary: 'Real-time collaboration channel',
  },
  { method: 'GET', url: `${WB}/presence`, ticket: 'GC-091', summary: 'Presence' },
  // Comments
  { method: 'GET', url: `${WB}/comments`, ticket: 'GC-046', summary: 'Listing comments' },
  { method: 'POST', url: `${WB}/comments`, ticket: 'GC-046', summary: 'Adding a comment' },
  {
    method: 'PATCH',
    url: `${WB}/comments/:commentId`,
    ticket: 'GC-046',
    summary: 'Editing or resolving a comment',
  },
  {
    method: 'DELETE',
    url: `${WB}/comments/:commentId`,
    ticket: 'GC-046',
    summary: 'Deleting a comment',
  },
  // Version history
  { method: 'GET', url: `${WB}/revisions`, ticket: 'GC-094', summary: 'Revision timeline' },
  { method: 'GET', url: `${WB}/versions`, ticket: 'GC-095', summary: 'Listing named versions' },
  { method: 'POST', url: `${WB}/versions`, ticket: 'GC-095', summary: 'Creating a named version' },
  {
    method: 'POST',
    url: `${WB}/versions/:versionId/restore`,
    ticket: 'GC-095',
    summary: 'Restoring a version',
  },
  // Sharing
  { method: 'GET', url: `${WB}/collaborators`, ticket: 'GC-098', summary: 'Listing collaborators' },
  { method: 'POST', url: `${WB}/collaborators`, ticket: 'GC-098', summary: 'Sharing a workbook' },
  {
    method: 'DELETE',
    url: `${WB}/collaborators/:userId`,
    ticket: 'GC-098',
    summary: 'Removing a collaborator',
  },
  { method: 'POST', url: `${WB}/share-links`, ticket: 'GC-099', summary: 'Creating a share link' },
  {
    method: 'DELETE',
    url: `${WB}/share-links/:linkId`,
    ticket: 'GC-099',
    summary: 'Revoking a share link',
  },
  {
    method: 'GET',
    url: `${WB}/protected-ranges`,
    ticket: 'GC-100',
    summary: 'Listing protected ranges',
  },
  {
    method: 'POST',
    url: `${WB}/protected-ranges`,
    ticket: 'GC-100',
    summary: 'Protecting a range',
  },
  // Organization administration
  { method: 'GET', url: '/api/v1/members', ticket: 'GC-017', summary: 'Listing members' },
  {
    method: 'POST',
    url: '/api/v1/members/invitations',
    ticket: 'GC-016',
    summary: 'Inviting a member',
  },
  {
    method: 'PATCH',
    url: '/api/v1/members/:userId',
    ticket: 'GC-017',
    summary: 'Changing a member role',
  },
  {
    method: 'DELETE',
    url: '/api/v1/members/:userId',
    ticket: 'GC-017',
    summary: 'Removing a member',
  },
  {
    method: 'GET',
    url: '/api/v1/audit-events',
    ticket: 'GC-090',
    summary: 'Searching the audit log',
  },
  { method: 'GET', url: '/api/v1/sessions', ticket: 'GC-019', summary: 'Listing active sessions' },
  {
    method: 'DELETE',
    url: '/api/v1/sessions/:sessionId',
    ticket: 'GC-019',
    summary: 'Revoking a session',
  },
  {
    method: 'POST',
    url: '/api/v1/auth/password-reset',
    ticket: 'GC-018',
    summary: 'Requesting a password reset',
  },
  {
    method: 'POST',
    url: '/api/v1/auth/password-reset/confirm',
    ticket: 'GC-018',
    summary: 'Confirming a password reset',
  },
  {
    method: 'GET',
    url: '/api/v1/organizations/current',
    ticket: 'GC-014',
    summary: 'Organization settings',
  },
  {
    method: 'PATCH',
    url: '/api/v1/organizations/current',
    ticket: 'GC-014',
    summary: 'Updating organization settings',
  },
  // Operations
  { method: 'GET', url: '/api/v1/metrics', ticket: 'GC-101', summary: 'Metrics export' },
];

/** Pending routes reachable without a session (password reset happens before sign-in). */
const PUBLIC_PENDING = new Set<string>([
  '/api/v1/auth/password-reset',
  '/api/v1/auth/password-reset/confirm',
]);

export function registerPendingRoutes(app: FastifyInstance): void {
  for (const route of PENDING_ROUTES) {
    app.route({
      method: route.method,
      url: route.url,
      handler: async (request, reply) => {
        if (!PUBLIC_PENDING.has(route.url) && !request.auth) {
          return reply.status(401).send({
            data: null,
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue' },
          });
        }
        return sendNotImplemented(reply, route.ticket, route.summary);
      },
    });
  }
}
