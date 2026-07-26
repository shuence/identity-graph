/**
 * ponytail: runnable self-check for variant vs blocker heuristics.
 * Run: npx tsx src/lib/identity/normalize.check.ts
 */
import { namesAreVariant, normalizeDob, normalizeName } from "./normalize";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(normalizeName("Mohd. Aslam") === normalizeName("Mohammed Aslam"), "Mohd ≈ Mohammed");
assert(namesAreVariant("Mohd Aslam", "Mohammad Aslam"), "phonetic variants");
assert(!namesAreVariant("Mohammed Aslam", "Rahul Sharma"), "different people");

const dob = normalizeDob("12/03/1988");
const dobBad = normalizeDob("12/03/1989");
assert(dob.year === "1988" && dobBad.year === "1989", "DOB years");

console.log("identity normalize checks passed");
