import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Integration tests share one Postgres test database; run files serially.
    fileParallelism: false,
  },
})
