import { defineConfig } from 'tsup';

// The shared workspace package ships TypeScript source, so it is bundled into the API build.
export default defineConfig({
  entry: ['src/index.ts', 'src/db/cli.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: ['@gridcalc/shared'],
});
