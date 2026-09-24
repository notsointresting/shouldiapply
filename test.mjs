// Minimal checks for the code-owned logic: `node test.mjs`.
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { recommendation, extractRequirements } = await import("./jev.js");
const t = await import("./tracker.js");

// verdict thresholds
assert.equal(recommendation({ passProbability: 0.8 }).verdict, "apply");
assert.equal(recommendation({ passProbability: 0.4 }).verdict, "stretch");
assert.equal(recommendation({ passProbability: 0.1 }).verdict, "skip");
assert.equal(recommendation({}).verdict, "maybe");
assert.equal(recommendation({ passProbability: 0.9, hardBlocker: 0.8 }).verdict, "skip");
assert.match(recommendation({ passProbability: 0.7, requirements: [{ met: 0.1 }, { met: 0.9 }] }).reasons.join(), /1 of 2 things/);

// requirement extraction: inline section, stops at "Nice to have"
const inline = extractRequirements("Build stuff. Requirements: 3+ years Python, strong databases (PostgreSQL preferred), AWS and CI/CD. Nice to have: Redis.");
assert.deepEqual(inline, ["3+ years Python", "strong databases (PostgreSQL preferred)", "AWS and CI/CD"]);
// bulleted section
assert.deepEqual(extractRequirements("About\nWhat you'll need:\n- Go\n- Kubernetes\nBenefits\n- Snacks"), ["Go", "Kubernetes"]);
// no section, bullets only
assert.deepEqual(extractRequirements("Role\n• TypeScript\n• React"), ["TypeScript", "React"]);
assert.deepEqual(extractRequirements(""), []);

// safeUrl blocks script URLs
assert.equal(t.safeUrl("javascript:alert(1)"), "");
assert.equal(t.safeUrl("example.com/job"), "https://example.com/job");

// tracker: dup detection, status dates, undo, import, CSV
const a = t.addApplication({ title: "Eng", company: "Acme", url: "https://x.test/j/1?utm=a" });
assert.equal(t.addApplication({ title: "Eng", company: "Acme", url: "https://x.test/j/1" }).duplicate.id, a.app.id);
assert.ok(t.addApplication({ title: "eng ", company: "ACME" }).duplicate, "title+company dup when no url");
t.updateApplication(a.app.id, { status: "interview" });
assert.ok(t.loadApplications().find((x) => x.id === a.app.id).statusDates.interview);
const removed = t.removeApplication(a.app.id);
assert.equal(t.loadApplications().length, 2);
t.restoreApplication(removed);
assert.equal(t.loadApplications().length, 3);
assert.equal(t.importJSON(JSON.stringify([{ id: a.app.id }, { title: "New", status: "bogus", url: "javascript:x", fit: 7 }])), 1);
const imported = t.loadApplications().find((x) => x.title === "New");
assert.equal(imported.status, "applied");
assert.equal(imported.url, "");
assert.equal(imported.fit, null);
assert.throws(() => t.importJSON("{}"));
assert.equal(t.exportCSV([{ title: 'say "hi"' }]).split("\n")[1].slice(0, 12), '"say ""hi"""');

// calibration buckets
const cal = t.calibration([{ fit: 0.7, status: "interview" }, { fit: 0.65, status: "rejected" }, { fit: 0.1, status: "applied" }]);
assert.deepEqual(cal.map((b) => [b.n, b.interviews]), [[1, 0], [0, 0], [2, 1]]);

console.log("all checks passed");

// improve: gap list, invented-number guard, JSON parsing
const { buildGaps, unsupportedNumbers, parseJsonReply } = await import("./improve.js");
const gaps = buildGaps({ requirements: [{ name: "Kubernetes", met: 0.2 }, { name: "Python", met: 0.9 }], seniority: "underqualified" });
assert.ok(gaps.some((g) => g.includes("Kubernetes")) && !gaps.some((g) => g.includes("Python")));
assert.ok(gaps.some((g) => /Seniority/.test(g)));
assert.match(buildGaps({})[0], /No big gaps/);
assert.deepEqual(unsupportedNumbers("Cut p95 from 450ms to 120ms, grew 40%", "p95 450ms->120ms"), ["40"]);
assert.deepEqual(unsupportedNumbers("Led team of [add number if true]", "led team"), []);
assert.equal(parseJsonReply('```json\n{"summary":"ok"}\n```').summary, "ok");
assert.throws(() => parseJsonReply("no json here"));
console.log("improve checks passed");
