import { logicalFunctions } from './logical.js';
import { lookupFunctions } from './lookup.js';
import { mathFunctions } from './math.js';
import { statisticalFunctions } from './statistical.js';
import { textFunctions } from './text.js';
import type { FunctionCategory, FunctionSpec } from './types.js';

/** The built-in function library, keyed by upper-case name. */
const ALL_FUNCTIONS: readonly FunctionSpec[] = [
  ...mathFunctions,
  ...statisticalFunctions,
  ...logicalFunctions,
  ...textFunctions,
  ...lookupFunctions,
];

const REGISTRY: ReadonlyMap<string, FunctionSpec> = new Map(
  ALL_FUNCTIONS.map((spec) => [spec.name, spec] as const),
);

export function getFunction(name: string): FunctionSpec | undefined {
  return REGISTRY.get(name.toUpperCase());
}

export interface FunctionInfo {
  readonly name: string;
  readonly category: FunctionCategory;
  readonly signature: string;
  readonly description: string;
  readonly minArgs: number;
  readonly maxArgs: number;
}

/** Catalog for the function picker / autocomplete, sorted by name. */
export function listFunctions(): readonly FunctionInfo[] {
  return [...ALL_FUNCTIONS]
    .map(({ name, category, signature, description, minArgs, maxArgs }) => ({
      name,
      category,
      signature,
      description,
      minArgs,
      maxArgs,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
