import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDatabaseAt, openDatabaseAt, workspaceHasDemoRepo } from "../db";

function countArtifacts(filePath: string, seedDemo: boolean): number {
  const db = openDatabaseAt(filePath, { seedDemo });
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM DecisionArtifact")
    .get() as { cnt: number };
  closeDatabaseAt(filePath);
  return row.cnt;
}

describe("demo decisions only go into the demo database", () => {
  // This run's scratch folder (see setup/isolate-test-env.ts)
  const scratch = fs.mkdtempSync(
    path.join(path.dirname(process.env.PREMISE_DB_PATH!), "seed-")
  );

  test("a user's own repo is not a demo workspace; this repo's demo copy is", () => {
    const userRepo = path.join(scratch, "user-repo");
    fs.mkdirSync(path.join(userRepo, "services"), { recursive: true });
    expect(workspaceHasDemoRepo(userRepo)).toBe(false);
    // The test workspace holds a copy of examples/demo-repo
    expect(workspaceHasDemoRepo()).toBe(true);
  });

  test("a database opened without demo seeding starts empty", () => {
    expect(countArtifacts(path.join(scratch, "user.db"), false)).toBe(0);
  });

  test("a demo database gets the seeded decisions", () => {
    expect(countArtifacts(path.join(scratch, "demo.db"), true)).toBeGreaterThan(0);
  });

  test("reopening an empty user database never back-fills demo decisions", () => {
    const file = path.join(scratch, "user-again.db");
    expect(countArtifacts(file, false)).toBe(0);
    expect(countArtifacts(file, false)).toBe(0);
  });
});
