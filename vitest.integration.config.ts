// Integration tests run the real domain services against a disposable SQLite file, built fresh from migrations/*.sql
// on every run (tests/integration/global-setup.ts) and emptied between suites (resetDb in tests/integration/world.ts).
//   npm run test:integration                       # the file: .data/hh_test.sqlite
//   TEST_DATABASE_URL=file:/tmp/x.sqlite npm run test:integration
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? `file:${fileURLToPath(new URL("./.data/hh_test.sqlite", import.meta.url))}`;

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "integration-test-secret-integration-test",
      DEMO_MODE: "false",
    },
  },
});
