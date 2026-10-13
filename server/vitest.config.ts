import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    // Integration tests share one Postgres test database; run files serially.
    fileParallelism: false,
  },
})
