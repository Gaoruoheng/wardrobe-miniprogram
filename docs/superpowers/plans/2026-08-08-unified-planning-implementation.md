# Unified Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate duplicate plans and tasks into a single plans tab while migrating every existing task into plans without data loss.

**Architecture:** Add a small pure planning-state utility that merges and normalizes legacy checklist arrays. The index page reads that state, persists a one-time migration through the existing wardrobe metadata API, and renders only one checklist tab with the existing selected-clothes card.

**Tech Stack:** WeChat Mini Program WXML/WXSS, CommonJS, CloudBase database SDK, Node.js built-in test runner.

---

### Task 1: Define and test legacy checklist migration

**Files:**

- Create: `miniprogram/utils/planningState.js`
- Create: `miniprogram/tests/planningState.test.js`

- [ ] **Step 1: Write the failing test** — call `mergeLegacyPlans` with one plan, two tasks, and duplicate/missing IDs. Assert every text and done state remains, `migrated` is true, and generated IDs are unique.
- [ ] **Step 2: Run `node --test miniprogram/tests/planningState.test.js`** — expect failure because the module does not exist.
- [ ] **Step 3: Implement `mergeLegacyPlans(plans, tasks)`** — normalize arrays, concatenate plans before tasks, preserve text/done state, generate stable unique IDs, and report whether legacy tasks need persisting.
- [ ] **Step 4: Run `node --test miniprogram/tests/planningState.test.js`** — expect pass.
- [ ] **Step 5: Commit** — `git commit -m "test: cover legacy task migration"`.

### Task 2: Read and persist the unified planning state

**Files:**

- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/utils/indexDataLoader.js`
- Modify: `miniprogram/utils/indexCache.js`
- Modify: `miniprogram/utils/indexMetaActions.js`
- Modify: `miniprogram/utils/indexSelectionActions.js`
- Test: `tests/ui-optimization.test.js`

- [ ] **Step 1: Write failing source assertions** — assert the index page imports `mergeLegacyPlans`, holds `plans` only, and migration saves `{ plans, tasks: [] }`.
- [ ] **Step 2: Run `node --test tests/ui-optimization.test.js`** — expect failure because task state and task actions still exist.
- [ ] **Step 3: Implement the migration and cleanup** — merge legacy arrays whenever a wardrobe payload is applied, save the migration once, remove task-only state/actions/badge calculations, and write `tasks: []` in cached metadata.
- [ ] **Step 4: Run `node --test miniprogram/tests/planningState.test.js tests/ui-optimization.test.js`** — expect pass.
- [ ] **Step 5: Commit** — `git commit -m "feat: unify plan and task data"`.

### Task 3: Render one planning tab and preserve the pickup list

**Files:**

- Modify: `miniprogram/pages/index/index.wxml`
- Test: `tests/ui-optimization.test.js`

- [ ] **Step 1: Write failing markup assertions** — exactly one `计划` tab, no `任务` tab, planning section contains `pick-package-card`, and nesting is valid.
- [ ] **Step 2: Run `node --test tests/ui-optimization.test.js`** — expect failure because the WXML still has separate sections.
- [ ] **Step 3: Implement the unified view** — move current pickup-card markup into the plan section, bind the existing plan actions, remove the task section, and move 关于 from tab 4 to tab 3.
- [ ] **Step 4: Run `node --test` and `git diff --check`** — expect all tests passing and no whitespace errors.
- [ ] **Step 5: Commit** — `git commit -m "feat: merge task tab into plans"`.
