# Outfit Top-Level Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the outfit center from the task tab into its own top-level tab ordered after the wardrobe menu.

**Architecture:** Keep the existing single-page `activeTab` navigation and outfit components. Add a dedicated `activeTab === 1` scroll region, shift plan/task/about to indices 2/3/4, and make the label strip horizontally scrollable while keeping search fixed.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, Node.js built-in test runner.

---

### Task 1: Lock the independent-tab contract with tests

**Files:**
- Modify: `miniprogram/tests/outfitMarkup.test.js`
- Test: `miniprogram/tests/outfitMarkup.test.js`

- [x] **Step 1: Write the failing markup and lifecycle assertions**

Rename the integration test to `standalone outfit tab registers components and quick-save entry`. Assert the navigation contains `data-tab="1">套装`, the dedicated content has `wx:if="{{activeTab===1}}"` followed by `<outfit-section`, and task content begins at `activeTab===3`. Change the lifecycle assertion to require `activeTab === 1` before `loadOutfits({ skipCache: true, silent: true })`.

- [x] **Step 2: Run the focused test and verify failure**

Run: `node --test miniprogram/tests/outfitMarkup.test.js`

Expected: FAIL because the current markup still places the outfit component under task tab index 2.

- [x] **Step 3: Commit the failing test together with the minimal implementation in Task 2**

The project keeps red tests out of standalone commits; stage the test with the implementation after it passes.

### Task 2: Move the outfit section and shift tab indices

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/styles/base.wxss`
- Modify: `miniprogram/tests/outfitMarkup.test.js`

- [x] **Step 1: Implement the top navigation order**

Wrap the five `.tab-item` controls in a horizontal `scroll-view.tabs-scroll`, ordered as menu 0, outfit 1, plan 2, task 3, about 4. Keep `.search-mini` as a sibling so it stays pinned at the right edge.

- [x] **Step 2: Implement the dedicated outfit content region**

Insert a `scroll-view.tab-content.outfit-tab-content` guarded by `activeTab===1` containing the existing `outfit-section`. Remove that component from the task region, then update plan/task/about guards to 2/3/4.

- [x] **Step 3: Update lifecycle loading**

Change both outfit-loading conditions in `onShow` and `switchTab` from tab index 2 to index 1. Do not alter cloud APIs, caches, editor routes, or quick-save behavior.

- [x] **Step 4: Add narrow-screen navigation styling**

Give `.tabs-scroll` `flex: 1`, `min-width: 0`, horizontal scrolling and `white-space: nowrap`. Give `.tabs-scroll-inner` inline flex layout, keep tab items from shrinking, preserve active pills, and ensure each tab has at least `var(--touch-target)` touch height. Keep search outside the scroll container.

- [x] **Step 5: Run focused and full verification**

Run: `node --test miniprogram/tests/outfitMarkup.test.js`

Expected: all focused tests PASS.

Run: `node --test miniprogram/tests/*.test.js tests/*.test.js`

Expected: all tests PASS.

Run: `git diff --check`

Expected: no output.

- [x] **Step 6: Commit the implementation**

```bash
git add miniprogram/pages/index/index.wxml miniprogram/pages/index/index.js miniprogram/pages/index/styles/base.wxss miniprogram/tests/outfitMarkup.test.js docs/superpowers/plans/2026-08-08-outfit-top-level-tab.md
git commit -m "feat(ui): move outfits to standalone tab"
```
