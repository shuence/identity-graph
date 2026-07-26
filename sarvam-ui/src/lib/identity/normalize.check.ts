/**
 * ponytail: runnable self-check for variant vs blocker heuristics.
 * Run: npx tsx src/lib/identity/normalize.check.ts
 */
import { namesAreVariant, normalizeDob, normalizeName } from "./normalize";
import { buildMatrix, summarize } from "./reconcile";
import { getDemoCase } from "./demo-case";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(normalizeName("Mohd. Aslam") === normalizeName("Mohammed Aslam"), "Mohd ≈ Mohammed");
assert(namesAreVariant("Mohd Aslam", "Mohammad Aslam"), "phonetic variants");
assert(!namesAreVariant("Mohammed Aslam", "Rahul Sharma"), "different people");

const dob = normalizeDob("12/03/1988");
const dobBad = normalizeDob("12/03/1989");
assert(dob.year === "1988" && dobBad.year === "1989", "DOB years");

const demo = getDemoCase();
const matrix = buildMatrix(demo.documents);
const s = summarize(matrix);
assert(s.blockers >= 1, "demo must surface DOB blocker on PAN");
assert(s.variants >= 1, "demo must surface name variants");
assert(s.uncertain >= 1, "demo must flag wet-stamp UNCERTAIN");
assert(demo.remediation.primaryDocLabel.toLowerCase().includes("pan"), "PAN is primary fix");

console.log("identity normalize/reconcile checks passed", s);
