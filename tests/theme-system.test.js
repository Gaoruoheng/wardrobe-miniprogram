const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("alternate skin uses one canonical user-facing identity", () => {
  const skin = read("miniprogram/utils/skin.js");
  const home = read("miniprogram/pages/home/home.wxml");

  assert.match(skin, /name:\s*['"]月宫衣阁['"]/);
  assert.match(home, />月宫衣阁<\/text>/);
  assert.doesNotMatch(home, />公主城堡<\/text>/);
});

test("skin changes atmosphere without replacing operation labels", () => {
  const add = read("miniprogram/pages/add/add.wxml");

  assert.match(add, /'新增衣物'/);
  assert.match(add, /'衣物信息'/);
  assert.match(add, /'选择分类'/);
  assert.match(add, /'\+ 分类'/);
  assert.doesNotMatch(add, /月宫入衣台|衣影小札|月签/);
});

test("shared theme contract and design documentation exist", () => {
  const tokenPath = path.join(root, "miniprogram/styles/theme-tokens.wxss");
  assert.equal(fs.existsSync(tokenPath), true, "shared theme token file should exist");

  const tokens = fs.readFileSync(tokenPath, "utf8");
  const app = read("miniprogram/app.wxss");
  const designPath = path.join(root, "DESIGN.md");
  assert.match(app, /@import\s+["']\.\/styles\/theme-tokens\.wxss["']/);
  ["bg", "surface", "ink", "muted", "accent", "gold", "border", "shadow", "decoration-opacity"].forEach(role => {
    assert.match(tokens, new RegExp(`--skin-${role}\\s*:`));
  });
  assert.equal(fs.existsSync(designPath), true, "DESIGN.md should document the theme contract");
});

test("isolated outfit components receive and consume the active skin", () => {
  const page = read("miniprogram/pages/index/index.wxml");
  const components = ["outfitSection", "outfitDetailPanel", "outfitQuickSave"];

  assert.equal((page.match(/skin="\{\{selectedSkin\}\}"/g) || []).length, 3);
  components.forEach(component => {
    const base = `miniprogram/components/${component}/index`;
    const logic = read(`${base}.js`);
    const template = read(`${base}.wxml`);
    const styles = read(`${base}.wxss`);

    assert.match(logic, /skin:\s*\{\s*type:\s*String/);
    assert.match(template, /theme-scope skin-\{\{skin\}\}/);
    assert.match(styles, /@import\s+["']\.\.\/\.\.\/styles\/theme-tokens\.wxss["']/);
    assert.match(styles, /var\(--skin-(?:surface|ink|accent|border|shadow)\)/);
  });
});
