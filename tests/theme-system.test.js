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

test("primary controls meet touch, contrast, and motion preferences", () => {
  const indexTemplate = read("miniprogram/pages/index/index.wxml");
  const indexBase = read("miniprogram/pages/index/styles/base.wxss");
  const moon = read("miniprogram/pages/index/styles/moon-polish.wxss");
  const homeTemplate = read("miniprogram/pages/home/home.wxml");
  const homeBase = read("miniprogram/pages/home/styles/base.wxss");
  const homeSkin = read("miniprogram/pages/home/styles/princess-cards.wxss");
  const app = read("miniprogram/app.wxss");

  assert.match(indexTemplate, /class="header-action-hit share-button"/);
  assert.match(indexTemplate, /class="header-action-hit"[^>]*bindtap="goManage"|bindtap="goManage"[^>]*class="header-action-hit"/);
  assert.match(indexBase, /\.header-action-hit\s*\{[\s\S]*?min-height:\s*var\(--touch-target\)/);
  assert.match(homeTemplate, /class="skin-switch-hit"/);
  assert.match(homeBase, /\.skin-switch-hit\s*\{[\s\S]*?min-height:\s*var\(--touch-target\)/);

  assert.doesNotMatch(app, /#8a7499/i);
  assert.doesNotMatch(indexBase, /#b59ba5/i);
  assert.doesNotMatch(moon, /#947da7/i);
  [app, moon, homeSkin].forEach(styles => assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/));
});

test("moon skin keeps signature art while routine surfaces stay quiet", () => {
  const palace = read("miniprogram/pages/index/styles/moon-palace.wxss");
  const polish = read("miniprogram/pages/index/styles/moon-polish.wxss");
  const finalPolish = polish.split("/* Final quiet-surface pass. */")[1] || "";
  const selectors = styles => new Set(
    [...styles.matchAll(/(^|\})\s*([^@{}][^{}]*)\{/gm)]
      .flatMap(match => match[2].split(",").map(value => value.trim()))
      .filter(Boolean)
  );
  const palaceSelectors = selectors(palace);
  const polishSelectors = selectors(polish);
  const duplicateCount = [...palaceSelectors].filter(selector => polishSelectors.has(selector)).length;

  assert.ok(duplicateCount <= 25, `expected at most 25 cross-file duplicate selectors, got ${duplicateCount}`);
  assert.match(finalPolish, /\.cloth-card-watermark[\s\S]*?display:\s*none/);
  assert.match(finalPolish, /\.cat-title-cloud-mark[\s\S]*?display:\s*none/);
  assert.match(finalPolish, /\.cloth-row[\s\S]*?background:\s*var\(--skin-surface\)/);
  assert.match(finalPolish, /\.cloth-row[\s\S]*?box-shadow:\s*var\(--skin-shadow\)/);
});
