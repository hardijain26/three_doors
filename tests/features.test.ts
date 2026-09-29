import { test } from "node:test";
import assert from "node:assert/strict";
const { FEATURES } = await import("../lib/features/index.ts");
const { assertPublicUrl, htmlToText, isBlockedIp } = await import("../lib/security/safe-fetch.ts");

test("safe fetch refuses non-https and private addresses", async () => {
  for (const bad of ["http://example.com", "https://127.0.0.1/x", "https://10.0.0.5", "https://169.254.169.254/latest/meta-data", "https://[::1]/", "https://localhost/", "https://user:pw@example.com", "https://example.com:8443/", "ftp://example.com"])
    await assert.rejects(assertPublicUrl(bad), undefined, bad);
});

test("htmlToText keeps job links and drops scripts", () => {
  const t = htmlToText('<script>steal()</script><ul><li><a href="/jobs/1">Senior PM</a> London</li></ul>', "https://board.example/jobs");
  assert.ok(t.includes("Senior PM [https://board.example/jobs/1]")); assert.ok(!t.includes("steal"));
});

test("extract_openings drops invented or unsafe links and clamps scores", () => {
  const r = FEATURES.extract_openings.parse(JSON.stringify({ openings: [
    { company: "Acme", title: "PM", location: "London", link: "javascript:alert(1)", score: 140, why: "x", flag: "" },
    { company: "", title: "PM" },
    { company: "Beta", title: "Senior PM", link: "https://beta.io/jobs/2", score: 55 } ] }));
  assert.equal(r.openings.length, 2); assert.equal(r.openings[0].link, ""); assert.equal(r.openings[0].score, 100); assert.equal(r.openings[1].link, "https://beta.io/jobs/2");
});

test("cv_tailor splits analysis from resume; career_skills needs written steps", () => {
  const r = FEATURES.cv_tailor.parse("Fit: good\n===RESUME===\n```markdown\n# Hardi\nPM at PayU, lifted conversion 7%\n```");
  assert.equal(r.analysis, "Fit: good"); assert.ok(r.md.startsWith("# Hardi"));
  assert.throws(() => FEATURES.career_skills.validate({ steps: [{ title: "PM" }] }));
  const p = FEATURES.career_skills.build(FEATURES.career_skills.validate({ target: "PM", steps: [{ org: "KPMG", did: "audited 6 clients" }] }));
  assert.ok(p.user.includes("What I did: audited 6 clients") && p.user.includes("\n"));
});

test("blocklist covers mapped, NAT64, 6to4 and metadata addresses", () => {
  for (const ip of ["127.0.0.1", "169.254.169.254", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "fec0::1", "fd00::1", "100.64.1.1"]) assert.equal(isBlockedIp(ip), true, ip);
  for (const ip of ["8.8.8.8", "2606:4700:4700::1111"]) assert.equal(isBlockedIp(ip), false, ip);
});
