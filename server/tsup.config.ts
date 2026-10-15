import { defineConfig } from 'tsup'

export default defineConfig({
  // The server, plus the one-off operator commands shipped in the image (docs/step-14-deploy-ops.md).
  entry: { server: 'src/server.ts', 'create-admin': 'src/cli/create-admin.ts' },
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
