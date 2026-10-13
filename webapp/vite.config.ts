import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: [
      // Every `vite build` (any --mode) ships no demo data: the fixtures become an empty stub and
      // API_MODE is forced to http (P57). Mock mode exists only in `vite dev`.
      ...(command === 'build'
        ? [
            { find: '@/mocks/fixtures', replacement: path.resolve(import.meta.dirname, './src/lib/no-mocks.ts') },
            { find: '@/mocks/hydrate', replacement: path.resolve(import.meta.dirname, './src/lib/no-mocks-hydrate.ts') },
          ]
        : []),
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  server: {
    // Same-origin API in dev, mirroring the single-service production deploy.
    proxy: {
      '/api': { target: 'http://localhost:4000', ws: true },
    },
  },
}))
