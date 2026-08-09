# Add Save Button Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将普通主题新增衣物页底部保存操作调整为与顶部标题卡完全一致的浅粉、深棕配色。

**Architecture:** 保留现有 WXML 结构和 `saveItem` 事件，仅在页面级 WXSS 为普通主题补全视觉底座；月宫主题继续通过更具体的选择器覆盖。用静态回归测试锁定关键视觉属性和现有业务绑定。

**Tech Stack:** 微信小程序 WXML、WXSS、Node.js `node:test`

---

### Task 1: 锁定普通主题保存按钮样式

**Files:**
- Modify: `tests/ui-optimization.test.js`
- Modify: `miniprogram/pages/add/add.wxss`

- [ ] **Step 1: Write the failing test**

更新 `tests/ui-optimization.test.js` 的按钮测试，断言 `.save-btn` 使用 `#FFE6EF` 背景、`#5C4B51` 文字和描边、胶囊圆角及 `:active` 反馈，同时断言 WXML 继续绑定 `saveItem` 并保留“保存到衣柜”。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-optimization.test.js`

Expected: FAIL，因为普通主题 `.save-btn` 仍使用深玫红渐变与白字。

- [ ] **Step 3: Write minimal implementation**

把 `miniprogram/pages/add/add.wxss` 普通主题 `.save-btn` 的深玫红渐变、白字和粉色阴影替换为顶部标题卡同款浅粉背景、深棕文字、描边与偏移阴影；同步调整 `:active` 阴影。保持位置、高度、过渡和月宫主题规则不变。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-optimization.test.js`

Expected: PASS。

- [ ] **Step 5: Run complete verification**

Run: `node --test tests/*.test.js miniprogram/tests/*.test.js`

Expected: 全部测试通过且没有报错。

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-09-add-save-button-design.md docs/superpowers/plans/2026-08-09-add-save-button-polish.md tests/ui-optimization.test.js miniprogram/pages/add/add.wxss
git commit -m "fix(ui): match add save button palette"
```
