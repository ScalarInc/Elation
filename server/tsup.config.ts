import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @elation/shared ships TypeScript source, so it must be bundled in.
  // Everything else stays an external runtime dependency.
  noExternal: ['@elation/shared'],
})
