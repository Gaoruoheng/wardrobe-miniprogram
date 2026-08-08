const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

function assertWxmlNesting(source) {
  const stack = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const commentEnd = source.indexOf("-->", start + 4);
      cursor = commentEnd < 0 ? source.length : commentEnd + 3;
      continue;
    }

    let end = start + 1;
    let inQuote = false;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char.charCodeAt(0) === 34) inQuote = !inQuote;
      if (char === ">" && !inQuote) break;
    }
    if (end >= source.length) break;

    const token = source.slice(start, end + 1);
    const match = token.match(/^<\/?\s*([\w-]+)/);
    if (match) {
      const tagName = match[1];
      const closing = token.slice(0, 2) === "</";
      const selfClosing = /\/\s*>$/.test(token);
      if (closing) {
        assert.equal(stack.pop(), tagName, `WXML nesting mismatch near: ${token}`);
      } else if (!selfClosing) {
        stack.push(tagName);
      }
    }
    cursor = end + 1;
  }
  assert.deepEqual(stack, [], "WXML has unclosed tags");
}

test("standalone outfit tab registers components and quick-save entry", () => {
  const indexWxml = read("miniprogram/pages/index/index.wxml");
  const indexJson = read("miniprogram/pages/index/index.json");
  const outfitTab = indexWxml.match(/<scroll-view[^>]*wx:if="\{\{activeTab===1\}\}"[^>]*>([\s\S]*?)<\/scroll-view>/);
  const taskTab = indexWxml.match(/<scroll-view[^>]*wx:if="\{\{activeTab===3\}\}"[^>]*>([\s\S]*?)<\/scroll-view>/);

  assert.match(indexWxml, /data-tab="0"[\s\S]*data-tab="1">套装[\s\S]*data-tab="2"[\s\S]*data-tab="3"[\s\S]*data-tab="4"/);
  assert.ok(outfitTab, "standalone outfit tab should use activeTab 1");
  assert.match(outfitTab[1], /<outfit-section/);
  assert.ok(taskTab, "task tab should use activeTab 3");
  assert.doesNotMatch(taskTab[1], /<outfit-section/);
  assert.match(indexWxml, /<outfit-detail-panel/);
  assert.match(indexWxml, /<outfit-quick-save/);
  assert.match(indexWxml, /bindtap="openQuickSaveOutfit"/);
  assert.match(indexJson, /"outfit-section"/);
  assert.match(indexJson, /"outfit-detail-panel"/);
  assert.match(indexJson, /"outfit-quick-save"/);
});

test("outfit integration keeps index WXML nesting valid", () => {
  assertWxmlNesting(read("miniprogram/pages/index/index.wxml"));
});

test("dedicated outfit editor exposes inputs filters selection and save", () => {
  const appJson = read("miniprogram/app.json");
  const editorWxml = read("miniprogram/pages/outfit-edit/outfit-edit.wxml");

  assert.match(appJson, /pages\/outfit-edit\/outfit-edit/);
  [
    "outfit-name-input",
    "outfit-note-input",
    "outfit-category",
    "outfit-selected-count",
    "outfit-item-check",
    "outfit-save"
  ].forEach(name => assert.match(editorWxml, new RegExp(name)));
  assertWxmlNesting(editorWxml);
});

test("standalone outfit tab loads and silently refreshes outfits", () => {
  const indexSource = read("miniprogram/pages/index/index.js");
  assert.match(indexSource, /activeTab\s*===\s*1[\s\S]{0,160}?loadOutfits\(\{\s*skipCache:\s*true/);
  assert.match(indexSource, /tab\s*===\s*1\s*&&\s*!this\._outfitsLoaded\)\s*this\.loadOutfits\(\)/);
});

test("top navigation scrolls without moving the search action", () => {
  const indexWxml = read("miniprogram/pages/index/index.wxml");
  const baseWxss = read("miniprogram/pages/index/styles/base.wxss");
  assert.match(indexWxml, /<scroll-view[^>]*class="tabs-scroll"[^>]*scroll-x[^>]*>[\s\S]*class="tabs-scroll-inner"[\s\S]*<\/scroll-view>\s*<view bindtap="toggleSearch" class="search-mini">/);
  assert.match(baseWxss, /\.tabs-scroll\s*\{[\s\S]*?flex:\s*1/);
  assert.match(baseWxss, /\.tab-item\s*\{[\s\S]*?min-height:\s*var\(--touch-target\)/);
  assert.match(baseWxss, /\.search-mini\s*\{[\s\S]*?min-height:\s*var\(--touch-target\)/);
});

test("outfit actions hydrate paged selections and guard duplicate quick saves", () => {
  const actions = read("miniprogram/utils/indexOutfitActions.js");
  assert.match(actions, /if\s*\(page\.data\.outfitSaving\)\s*return/);
  assert.match(actions, /wardrobeIndexApi\.fetchItemsByIds/);
  assert.match(actions, /部分衣物正在同步/);
});

test("outfit panels handle safe areas and partial detail data", () => {
  const baseWxss = read("miniprogram/pages/index/styles/base.wxss");
  const detailWxml = read("miniprogram/components/outfitDetailPanel/index.wxml");
  const sectionWxml = read("miniprogram/components/outfitSection/index.wxml");
  assert.match(baseWxss, /\.pick-panel[\s\S]*?env\(safe-area-inset-bottom\)/);
  assert.match(baseWxss, /\.pick-action-clear,.pick-action-outfit,.pick-action-save[\s\S]*?height:\s*var\(--touch-target\)/);
  assert.match(detailWxml, /outfit\.items\s*&&\s*outfit\.items\.length/);
  assert.match(detailWxml, /wearStatusText/);
  assert.match(sectionWxml, /outfit-stale/);
});
