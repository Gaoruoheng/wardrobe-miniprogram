const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const homeWxml = fs.readFileSync(path.join(projectRoot, "pages/home/home.wxml"), "utf8");
const homeBaseWxss = fs.readFileSync(path.join(projectRoot, "pages/home/styles/base.wxss"), "utf8");
const indexWxss = fs.readFileSync(path.join(projectRoot, "pages/index/index.wxss"), "utf8");

test("home skin sheet includes a dedicated preview illustration for default skin", () => {
  assert.match(homeWxml, /skin-preview-cream-house/);
  assert.match(homeBaseWxss, /cream-house-bear/);
});

test("index page no longer imports obsolete ink skin stylesheet", () => {
  assert.doesNotMatch(indexWxss, /jianghu-ink/);
});
