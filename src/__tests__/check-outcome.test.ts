import { describe, expect, test } from "bun:test";
import { decideCheckExit } from "../lib/expected-outcome";

const base = {
  brokenCount: 0,
  invalidatedCount: 0,
  decayingCount: 0,
  noDataCount: 0,
  strict: false,
  expectation: null,
};

describe("check exit code", () => {
  test("passes when every decision has data and holds", () => {
    expect(decideCheckExit(base)).toBe(0);
  });

  test("fails when a premise breaks", () => {
    expect(decideCheckExit({ ...base, brokenCount: 1, invalidatedCount: 1 })).toBe(1);
  });

  test("fails instead of passing quietly when a decision has no data", () => {
    expect(decideCheckExit({ ...base, noDataCount: 1 })).toBe(1);
  });

  test("no data fails even when the expected broken set matches", () => {
    const expectation = { ok: true, missing: [], unexpected: [] };
    expect(decideCheckExit({ ...base, brokenCount: 1, expectation })).toBe(0);
    expect(
      decideCheckExit({ ...base, brokenCount: 1, noDataCount: 1, expectation })
    ).toBe(1);
  });

  test("strict mode also fails on decaying premises", () => {
    expect(decideCheckExit({ ...base, decayingCount: 1 })).toBe(0);
    expect(decideCheckExit({ ...base, decayingCount: 1, strict: true })).toBe(1);
  });
});
