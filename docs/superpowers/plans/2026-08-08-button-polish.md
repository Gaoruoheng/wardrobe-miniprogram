# Header Share and Default Add Button Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the native share button's black outer frame and give the default skin a clearer, more polished add-clothing control without changing behavior or placement.

**Architecture:** Keep the native share `button` solely as a transparent interaction layer and render its visible face in the existing inner capsule. Expand the default FAB's WXML into named decorative parts styled by the base skin, while the later moon-skin selectors continue to own the rabbit variant.

**Tech Stack:** WeChat Mini Program WXML/WXSS, Node.js built-in test runner.

---

### Task 1: Lock the visual contract with regression tests

**Files:**
- Modify: `tests/ui-optimization.test.js`

- [ ] **Step 1: Add a failing regression test**

```js
test("share chrome is fully reset and default add action is explicit", () => {
  const wxml = read("miniprogram/pages/index/index.wxml");
  const wxss = read("miniprogram/pages/index/styles/base.wxss");

  assert.match(wxml, /class="fab-default-face"/);
  assert.match(wxml, />新增衣物<\/text>/);
  assert.match(wxss, /\.share-button\s*\{[\s\S]*?box-shadow:\s*none/);
  assert.match(wxss, /\.share-button:active\s*\{[\s\S]*?transform:\s*none/);
  assert.match(wxss, /\.fab-default-face\s*\{/);
  assert.match(wxss, /\.fab-default-label\s*\{/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/ui-optimization.test.js`

Expected: FAIL because the share reset and default FAB parts do not exist yet.

### Task 2: Reset the share host and build the default FAB face

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/styles/base.wxss`
- Test: `tests/ui-optimization.test.js`

- [ ] **Step 1: Replace the default plus text with structured markup**

```xml
<view class="fab-default-face" wx:else>
  <text class="fab-default-plus">+</text>
  <text class="fab-default-label">新增衣物</text>
  <text class="fab-default-spark">✦</text>
</view>
```

- [ ] **Step 2: Fully neutralize the native share host**

Add `box-shadow: none`, `color: inherit`, `height: var(--touch-target)`, `min-height: var(--touch-target)`, `overflow: visible`, and `width: var(--touch-target)` to `.share-button`. Add a `.share-button:active` rule that keeps `background`, `box-shadow`, and `transform` neutral.

- [ ] **Step 3: Style the default add face**

Keep `.fab-add` fixed at the existing right/bottom positions, change its base dimensions to a compact 184rpx by 92rpx pill, and style `.fab-default-face`, `.fab-default-plus`, `.fab-default-label`, and `.fab-default-spark` with the existing cream, coral, pink, and brown palette. Add a pressed state on `.fab-default-face`; do not alter moon-skin rabbit selectors.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test tests/ui-optimization.test.js`

Expected: all focused tests pass.

Run: `node --test tests/*.test.js miniprogram/tests/*.test.js`

Expected: all repository tests pass.

- [ ] **Step 5: Run UI detector and source checks**

Run: `node C:\Users\GaoRuoHeng\.codex\skills\impeccable\scripts\detect.mjs --json miniprogram/pages/index/index.wxml miniprogram/pages/index/styles/base.wxss`

Expected: no new actionable defects related to the changed controls.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add tests/ui-optimization.test.js miniprogram/pages/index/index.wxml miniprogram/pages/index/styles/base.wxss docs/superpowers/plans/2026-08-08-button-polish.md
git commit -m "fix(ui): polish share and add controls"
```
