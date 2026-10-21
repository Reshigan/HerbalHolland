// Once per run, before any suite: a fresh SQLite file with the schema from migrations/*.sql (the same files D1 runs).
import { rmSync } from "node:fs";
import { prepareSqliteFile, sqlitePath } from "../../prisma/sqlite-file";
import { TEST_DATABASE_URL } from "../../vitest.integration.config";

export default function setup() {
  const path = sqlitePath(TEST_DATABASE_URL);
  for (const suffix of ["", "-wal", "-shm", "-journal"]) rmSync(path + suffix, { force: true });
  prepareSqliteFile({ url: TEST_DATABASE_URL });
}
