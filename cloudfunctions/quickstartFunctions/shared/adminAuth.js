const crypto = require("crypto");

const ADMIN_PASSWORD_ENV = "KUMA_CLOSET_ADMIN_PASSWORD";
const ADMIN_TOKEN_SECRET_ENV = "KUMA_CLOSET_ADMIN_TOKEN_SECRET";
const DEFAULT_ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function normalizeSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getAdminPassword(env = process.env) {
  return normalizeSecret(env[ADMIN_PASSWORD_ENV]);
}

function getAdminTokenSecret(env = process.env) {
  return normalizeSecret(env[ADMIN_TOKEN_SECRET_ENV]) || getAdminPassword(env);
}

function hasAdminPasswordConfigured(env = process.env) {
  return !!getAdminPassword(env);
}

function verifyAdminPassword(password, env = process.env) {
  const configured = getAdminPassword(env);
  const input = normalizeSecret(password);
  return !!configured && input === configured;
}

function base64UrlEncode(text) {
  return Buffer.from(text, "utf8").toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(text) {
  const normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - normalized.length % 4);
  return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function signPayload(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function issueAdminToken(options = {}) {
  const env = options.env || process.env;
  const now = typeof options.now === "number" ? options.now : Date.now();
  const ttlMs = typeof options.ttlMs === "number" ? options.ttlMs : DEFAULT_ADMIN_TOKEN_TTL_MS;
  const secret = getAdminTokenSecret(env);
  if (!secret) return "";

  const payload = base64UrlEncode(JSON.stringify({
    role: "admin",
    exp: now + ttlMs
  }));
  return payload + "." + signPayload(payload, secret);
}

function verifyAdminToken(token, options = {}) {
  const env = options.env || process.env;
  const now = typeof options.now === "number" ? options.now : Date.now();
  const secret = getAdminTokenSecret(env);
  const parts = String(token || "").split(".");
  if (!secret || parts.length !== 2 || !parts[0] || !parts[1]) return false;

  const expectedSignature = signPayload(parts[0], secret);
  if (!timingSafeEqualText(parts[1], expectedSignature)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload.role === "admin" &&
      typeof payload.exp === "number" &&
      payload.exp > now;
  } catch (err) {
    return false;
  }
}

module.exports = {
  ADMIN_PASSWORD_ENV,
  ADMIN_TOKEN_SECRET_ENV,
  DEFAULT_ADMIN_TOKEN_TTL_MS,
  getAdminPassword,
  hasAdminPasswordConfigured,
  issueAdminToken,
  verifyAdminPassword,
  verifyAdminToken
};
