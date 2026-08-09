# Add Save Button Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将普通主题新增衣物页底部保存操作补全为粉红、可爱且有明确触控反馈的主按钮。

**Architecture:** 保留现有 WXML 结构和 `saveItem` 事件，仅在页面级 WXSS 为普通主题补全视觉底座；月宫主题继续通过更具体的选择器覆盖。用静态回归测试锁定关键视觉属性和现有业务绑定。

**Tech Stack:** 微信小程序 WXML、WXSS、Node.js `node:test`

---

### Task 1: 锁定普通主题保存按钮样式

**Files:**
- Modify: `tests/ui-optimization.test.js`
- Modify: `miniprogram/pages/add/add.wxss`

- [ ] **Step 1: Write the failing test**

在 `tests/ui-optimization.test.js` 增加测试，断言 `.save-btn` 包含粉红渐变、白色文字、胶囊圆角、柔和阴影及 `:active` 反馈，同时断言 WXML 继续绑定 `saveItem` 并保留“保存到衣柜”。

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ui-optimization.test.js`

Expected: FAIL，因为普通主题 `.save-btn` 尚未定义粉红背景和交互视觉。

- [ ] **Step 3: Write minimal implementation**

在 `miniprogram/pages/add/add.wxss` 的普通主题 `.save-btn` 中添加粉红渐变、白字、圆角、边框、柔和阴影和过渡；用 `::before`、`::after` 添加奶油高光点，并添加 `:active` 与 reduced-motion 样式。保持位置、高度和月宫主题规则不变。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ui-optimization.test.js`

Expected: PASS。

- [ ] **Step 5: Run complete verification**

Run: `node --test tests/*.test.js miniprogram/tests/*.test.js`

Expected: 全部测试通过且没有报错。

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-09-add-save-button-design.md docs/superpowers/plans/2026-08-09-add-save-button-polish.md tests/ui-optimization.test.js miniprogram/pages/add/add.wxss
git commit -m "fix(ui): polish add save button"
```
