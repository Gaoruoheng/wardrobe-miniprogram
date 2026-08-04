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

test("task tab registers outfit components and quick-save entry", () => {
  const indexWxml = read("miniprogram/pages/index/index.wxml");
  const indexJson = read("miniprogram/pages/index/index.json");

  assert.match(indexWxml, /<outfit-section/);
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
