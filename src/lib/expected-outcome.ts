/**
 * `check --expect-broken a,b`: CI states which premises it knows are broken.
 * The check passes only when the broken set is exactly that list; an
 * expected premise that holds, or any other premise that breaks, fails it.
 * Each entry matches a premise id or variable name.
 */
export interface ExpectedBrokenResult {
  ok: boolean;
  /** Expected to be broken but not broken */
  missing: string[];
  /** Broken but not expected (premise ids) */
  unexpected: string[];
}

export function compareBrokenToExpected(
  brokenPremises: Array<{ id: string; variableName: string }>,
  expected: string[]
): ExpectedBrokenResult {
  const wanted = expected.map((e) => e.trim()).filter(Boolean);
  const matches = (p: { id: string; variableName: string }, e: string) =>
    p.id === e || p.variableName === e;

  const missing = wanted.filter((e) => !brokenPremises.some((p) => matches(p, e)));
  const unexpected = brokenPremises
    .filter((p) => !wanted.some((e) => matches(p, e)))
    .map((p) => p.id);
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected };
}
