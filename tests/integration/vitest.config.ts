// tests/integration/vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10_000,
    // Integration tests need a real Valkey instance
    // Run: docker compose -f infra/docker/docker-compose.yml up valkey -d
  }
})
