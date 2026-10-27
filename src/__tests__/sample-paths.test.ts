import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPILER_TEMPLATES, INITIAL_SEED_ARTIFACTS } from "../db/seed-data";

// Anything that looks like a file path: has a folder and a file extension.
const PATH_PATTERN =
  /(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|py|go|rs|java|rb|yaml|yml|json|toml|tf|md|sql|sh|cu|proto)\b/g;

function pathsIn(text: string): string[] {
  return [...new Set(text.match(PATH_PATTERN) || [])].filter(
    (p) => !p.startsWith("http")
  );
}

// The test preload copies examples/demo-repo into the scratch workspace root.
function exists(relPath: string): boolean {
  return fs.existsSync(path.join(process.env.PREMISE_WORKSPACE_ROOT || "", relPath));
}

const compilerModalSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../components/CompilerModal.tsx"),
  "utf8"
);

describe("Sample and seed text names only real files", () => {
  const sources: Array<[string, string]> = [
    ["seed decisions", JSON.stringify(INITIAL_SEED_ARTIFACTS)],
    ["Compile Decision samples", JSON.stringify(COMPILER_TEMPLATES)],
    ["Compile Decision dialog", compilerModalSource],
  ];

  for (const [name, text] of sources) {
    test(`${name} name no missing files`, () => {
      const missing = pathsIn(text).filter((p) => !exists(p));
      expect(missing).toEqual([]);
    });
  }

  test("the check catches a made-up path", () => {
    expect(pathsIn("delete services/audio-batcher/cuda-worker.py").filter((p) => !exists(p))).toEqual([
      "services/audio-batcher/cuda-worker.py",
    ]);
  });
});
