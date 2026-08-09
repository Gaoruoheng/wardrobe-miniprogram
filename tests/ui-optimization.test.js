const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function assertWxmlNesting(source) {
  const stack = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      cursor = end < 0 ? source.length : end + 3;
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
    if (!match) {
      cursor = end + 1;
      continue;
    }

    const tagName = match[1];
    const isClosing = token.slice(0, 2) === "</";
    const isSelfClosing = /\/\s*>$/.test(token);
    if (isClosing) {
      assert.equal(stack.pop(), tagName, `WXML nesting mismatch near: ${token}`);
    } else if (!isSelfClosing) {
      stack.push(tagName);
    }
    cursor = end + 1;
  }

  assert.deepEqual(stack, [], "WXML has unclosed tags");
}

test("shared UI tokens include readable text, radius, and touch targets", () => {
  const appWxss = read("miniprogram/app.wxss");
  assert.match(appWxss, /--text-main\s*:/);
  assert.match(appWxss, /--text-muted\s*:/);
  assert.match(appWxss, /--radius-lg\s*:/);
  assert.match(appWxss, /--touch-target\s*:/);
});

test("index keeps the existing controls while adding larger hit areas and feedback", () => {
  const wxml = read("miniprogram/pages/index/index.wxml");
  const wxss = read("miniprogram/pages/index/styles/base.wxss");
  assert.match(wxml, /class="cloth-select-hit"/);
  assert.match(wxml, /class="search-clear-hit"/);
  assert.match(wxml, /class="search-feedback"/);
  assert.match(wxml, /class="list-loading"/);
  assert.match(wxml, /class="todo-check-hit"/);
  assert.match(wxml, /class="todo-del-hit"/);
  assert.match(wxml, /class="pick-panel-close-hit"/);
  assert.match(wxss, /\.cloth-select-hit[\s\S]*?min-width:\s*var\(--touch-target\)/);
  assert.match(wxss, /\.todo-check-hit[\s\S]*?min-width:\s*var\(--touch-target\)/);
});

test("share native host has no visible outer chrome", () => {
  const wxss = read("miniprogram/pages/index/styles/base.wxss");

  assert.match(wxss, /\.share-button\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(wxss, /\.share-button:active\s*\{[\s\S]*?transform:\s*none/);
});

test("default skin add action uses a labeled visual face", () => {
  const wxml = read("miniprogram/pages/index/index.wxml");
  const wxss = read("miniprogram/pages/index/styles/base.wxss");

  assert.match(wxml, /class="fab-default-face"/);
  assert.match(wxml, />新增衣物<\/text>/);
  assert.match(wxss, /\.fab-default-face\s*\{/);
  assert.match(wxss, /\.fab-default-label\s*\{/);
});

test("index WXML keeps valid tag nesting", () => {
  assertWxmlNesting(read("miniprogram/pages/index/index.wxml"));
});

test("index migrates legacy tasks into the single plans state", () => {
  const indexJs = read("miniprogram/pages/index/index.js");
  const metaActions = read("miniprogram/utils/indexMetaActions.js");
  const selectionActions = read("miniprogram/utils/indexSelectionActions.js");
  const cache = read("miniprogram/utils/indexCache.js");

  assert.match(indexJs, /mergeLegacyPlans/);
  assert.match(indexJs, /plans:\s*planState\.plans/);
  assert.match(indexJs, /saveMeta\(\{ plans: planState\.plans, tasks: \[\] \}\)/);
  assert.doesNotMatch(indexJs, /taskBadgeCount|newTaskText|showTaskInput/);
  assert.doesNotMatch(metaActions, /addTask|toggleTaskDone|deleteTask/);
  assert.doesNotMatch(selectionActions, /calcTaskBadgeCount|page\.data\.tasks/);
  assert.match(cache, /tasks:\s*\[\]/);
});

test("index renders one planning tab with the pickup list at its top", () => {
  const wxml = read("miniprogram/pages/index/index.wxml");

  assert.match(wxml, /data-tab="2">计划<\/view>/);
  assert.doesNotMatch(wxml, /data-tab="3">任务/);
  assert.match(wxml, /activeTab===2[\s\S]*?pick-package-card/);
  assert.doesNotMatch(wxml, /activeTab===4/);
  assertWxmlNesting(wxml);
});

test("add page keeps the fixed save action and opts inputs into keyboard avoidance", () => {
  const wxml = read("miniprogram/pages/add/add.wxml");
  const wxss = read("miniprogram/pages/add/add.wxss");
  assert.match(wxml, /adjust-position="true"/);
  assert.match(wxml, /cursor-spacing="160"/);
  assert.match(wxss, /color:\s*var\(--text-muted\)/);
  assert.doesNotMatch(wxss, /color:\s*#9A8990/);
});

test("default add page save action matches the hero card palette", () => {
  const wxml = read("miniprogram/pages/add/add.wxml");
  const wxss = read("miniprogram/pages/add/add.wxss");

  assert.match(wxml, /class="save-btn kawaii-btn" bindtap="saveItem"/);
  assert.match(wxml, />保存到衣柜<\/text>/);
  assert.match(wxss, /\.save-btn\s*\{[^}]*min-height:\s*var\(--touch-target\)/);
  assert.match(wxss, /\.save-btn\s*\{[^}]*background:\s*#FFE6EF/);
  assert.match(wxss, /\.save-btn\s*\{[^}]*border:\s*4rpx solid #5C4B51/);
  assert.match(wxss, /\.save-btn\s*\{[^}]*color:\s*#5C4B51/);
  assert.match(wxss, /\.save-btn\s*\{[^}]*box-shadow:\s*6rpx 6rpx 0 #5C4B51/);
  assert.match(wxss, /\.save-btn:active\s*\{[^}]*transform:\s*translateY\(4rpx\)/);
});
