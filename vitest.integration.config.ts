// Integration tests run the real domain services against a disposable database.
//   TEST_DATABASE_URL=postgresql://…/hh_test npm run test:integration   (schema: prisma migrate deploy first)
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://hh:hh@127.0.0.1:5432/hh_test",
      SESSION_SECRET: "integration-test-secret-integration-test",
      DEMO_MODE: "false",
    },
  },
});
