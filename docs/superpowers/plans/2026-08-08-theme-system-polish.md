# Theme System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the existing skin identity, propagate it through outfit components, improve accessibility, reduce decorative noise, and establish reusable theme tokens without changing page layout or business behavior.

**Architecture:** Keep the stored skin ID `princess-castle` for backward compatibility while presenting one canonical user-facing identity, “月宫衣阁”. Introduce a shared WXSS token contract imported by pages and isolated components; components receive the selected skin explicitly. Existing structural styles remain, while targeted final overrides use tokens and quieter surfaces.

**Tech Stack:** WeChat Mini Program WXML/WXSS/JavaScript, CommonJS, Node.js built-in test runner.

---

### Task 1: Canonical theme contract and copy

**Files:**

- Create: `miniprogram/styles/theme-tokens.wxss`
- Create: `DESIGN.md`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/utils/skin.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/add/add.wxml`
- Create: `tests/theme-system.test.js`

- [ ] **Step 1: Write failing tests** that require the display name `月宫衣阁`, standard operation labels (`新增衣物`, `衣物信息`, `选择分类`, `+ 分类`), the shared token import, and documented theme roles.
- [ ] **Step 2: Run `node --test tests/theme-system.test.js`** and confirm the assertions fail against the current mixed “公主城堡/月宫” copy.
- [ ] **Step 3: Implement the shared token contract** with `--skin-bg`, `--skin-surface`, `--skin-ink`, `--skin-muted`, `--skin-accent`, `--skin-gold`, `--skin-border`, `--skin-shadow`, and `--skin-decoration-opacity`; retain the internal ID `princess-castle`.
- [ ] **Step 4: Replace metaphorical operation labels** while retaining atmospheric supporting copy and existing navigation/actions.
- [ ] **Step 5: Run the focused test** and expect all Task 1 assertions to pass.

### Task 2: Theme-aware isolated outfit components

**Files:**

- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/components/outfitSection/index.js`
- Modify: `miniprogram/components/outfitSection/index.wxml`
- Modify: `miniprogram/components/outfitSection/index.wxss`
- Modify: `miniprogram/components/outfitDetailPanel/index.js`
- Modify: `miniprogram/components/outfitDetailPanel/index.wxml`
- Modify: `miniprogram/components/outfitDetailPanel/index.wxss`
- Modify: `miniprogram/components/outfitQuickSave/index.js`
- Modify: `miniprogram/components/outfitQuickSave/index.wxml`
- Modify: `miniprogram/components/outfitQuickSave/index.wxss`
- Test: `tests/theme-system.test.js`

- [ ] **Step 1: Add failing assertions** requiring `skin="{{selectedSkin}}"`, a String `skin` property in every component, themed root classes, and token imports in each component stylesheet.
- [ ] **Step 2: Run the focused test** and confirm it fails because component styles are currently isolated and hard-coded.
- [ ] **Step 3: Pass the skin property into all outfit components** and apply `skin-{{skin}}` on each component root or panel.
- [ ] **Step 4: Convert the primary component surfaces, text, borders, selected states, warnings, and actions to shared tokens** while preserving dimensions and events.
- [ ] **Step 5: Run component and theme tests** and expect them to pass.

### Task 3: Accessibility and motion polish

**Files:**

- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/styles/base.wxss`
- Modify: `miniprogram/pages/home/styles/princess-cards.wxss`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/styles/base.wxss`
- Modify: `miniprogram/pages/index/styles/moon-polish.wxss`
- Modify: `miniprogram/app.wxss`
- Test: `tests/theme-system.test.js`

- [ ] **Step 1: Add failing assertions** for 88rpx hit wrappers, removal of global `transition: all`, AA-safe muted colors, and reduced-motion media rules.
- [ ] **Step 2: Run the focused test** and confirm the existing 48rpx actions, low-contrast colors, and infinite animations fail it.
- [ ] **Step 3: Add transparent 88rpx interaction wrappers** around the 48rpx share, settings, and skin-switch faces without changing their visible size.
- [ ] **Step 4: Darken only muted text roles**, replace `transition: all` with explicit properties, and add reduced-motion fallbacks for home and wardrobe animations.
- [ ] **Step 5: Run focused tests and source contrast checks** and expect them to pass.

### Task 4: Quieter hierarchy and maintainable overrides

**Files:**

- Modify: `miniprogram/pages/index/styles/moon-palace.wxss`
- Modify: `miniprogram/pages/index/styles/moon-polish.wxss`
- Modify: `miniprogram/pages/home/styles/princess-cards.wxss`
- Modify: `tests/theme-system.test.js`

- [ ] **Step 1: Add failing assertions** that final theme overrides hide routine card watermarks, use the shared surface/shadow tokens, and reduce the known duplicate-selector count.
- [ ] **Step 2: Run the focused test** and confirm current decoration and duplicate override patterns fail.
- [ ] **Step 3: Keep the three signature moments** (hero art, mooncake selection control, rabbit add control), mute routine list/search/plan surfaces, and remove redundant visual declarations where the final polish file already owns the selector.
- [ ] **Step 4: Run `node --test tests/*.test.js miniprogram/tests/*.test.js`**, JavaScript syntax checks, `git diff --check`, and the impeccable detector.
- [ ] **Step 5: Commit and push the verified branch**, then merge the completed result into `main` and push the archive repository.
