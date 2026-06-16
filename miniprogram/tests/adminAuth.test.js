const test = require("node:test");
const assert = require("node:assert/strict");

const {
  issueAdminToken,
  verifyAdminPassword,
  verifyAdminToken
} = require("../../cloudfunctions/quickstartFunctions/shared/adminAuth.js");

test("admin password must come from cloud environment", () => {
  assert.equal(verifyAdminPassword("20060216", {}), false);
  assert.equal(verifyAdminPassword("wrong", { KUMA_CLOSET_ADMIN_PASSWORD: "20060216" }), false);
  assert.equal(verifyAdminPassword("20060216", { KUMA_CLOSET_ADMIN_PASSWORD: "20060216" }), true);
});

test("admin token is signed, expires, and rejects tampering", () => {
  const env = {
    KUMA_CLOSET_ADMIN_PASSWORD: "20060216",
    KUMA_CLOSET_ADMIN_TOKEN_SECRET: "secret-for-tests"
  };
  const token = issueAdminToken({ env, now: 1000, ttlMs: 1000 });

  assert.equal(verifyAdminToken(token, { env, now: 1500 }), true);
  assert.equal(verifyAdminToken(token + "x", { env, now: 1500 }), false);
  assert.equal(verifyAdminToken(token, { env, now: 2501 }), false);
});
