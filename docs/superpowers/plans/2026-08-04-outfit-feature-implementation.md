# 套装功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为共享衣柜增加长期套装模板、快速保存、独立编辑和云端原子合并到拿衣清单的完整能力。

**Architecture:** 套装记录存入独立的 `wardrobe_outfits` 集合，所有权限和合并操作由现有 `quickstartFunctions` 云函数校验。小程序侧新增独立 API、缓存和页面动作模块；首页任务页只负责组合套装区与面板，独立编辑页负责全量衣物选择。

**Tech Stack:** 微信小程序 WXML/WXSS/JavaScript、微信云开发数据库与云函数、Node.js `node:test`。

---

## 文件结构

### 新建

- `cloudfunctions/quickstartFunctions/shared/outfits.js`：套装校验、权限判断和合并算法。
- `cloudfunctions/quickstartFunctions/handlers/outfit.js`：套装 CRUD 与原子应用接口。
- `miniprogram/services/outfitApi.js`：小程序侧云函数调用封装。
- `miniprogram/utils/outfitView.js`：套装卡片、权限和结果文案的纯视图逻辑。
- `miniprogram/utils/outfitCache.js`：按用户和衣柜缓存套装摘要。
- `miniprogram/utils/indexOutfitActions.js`：首页套装加载、快速保存、使用和删除动作。
- `miniprogram/components/outfitSection/index.{js,json,wxml,wxss}`：任务页套装横向卡片区。
- `miniprogram/components/outfitDetailPanel/index.{js,json,wxml,wxss}`：套装详情与主要操作。
- `miniprogram/components/outfitQuickSave/index.{js,json,wxml,wxss}`：从拿衣清单快速保存。
- `miniprogram/pages/outfit-edit/outfit-edit.{js,json,wxml,wxss}`：独立创建和编辑套装。
- `miniprogram/tests/outfitDomain.test.js`：纯领域逻辑测试。
- `miniprogram/tests/outfitCloudContract.test.js`：云函数路由与清理契约测试。
- `miniprogram/tests/outfitView.test.js`：前端视图状态和结果文案测试。
- `miniprogram/tests/outfitMarkup.test.js`：页面入口、组件注册和 WXML 结构测试。

### 修改

- `cloudfunctions/quickstartFunctions/index.js`：注册套装云函数路由。
- `cloudfunctions/quickstartFunctions/handlers/wardrobe.js`：删除衣柜时清理套装。
- `miniprogram/app.json`：注册套装编辑页。
- `miniprogram/pages/index/index.js`：增加套装状态和动作委托。
- `miniprogram/pages/index/index.json`：注册三个套装组件。
- `miniprogram/pages/index/index.wxml`：任务页插入套装区，拿衣面板增加快速保存。
- `miniprogram/pages/index/styles/base.wxss`：新增任务页分区间距与安全区适配。
- `miniprogram/utils/indexSelectionActions.js`：套装应用成功后复用现有选中状态刷新。
- `miniprogram/utils/indexCache.js`：衣物删除后让套装视图重新校验。

## Task 1：套装领域规则

**Files:**
- Create: `cloudfunctions/quickstartFunctions/shared/outfits.js`
- Create: `miniprogram/tests/outfitDomain.test.js`

- [ ] **Step 1: 写失败测试**

在 `miniprogram/tests/outfitDomain.test.js` 写入：

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const {
      normalizeOutfitInput,
      buildOutfitMerge,
      canManageOutfit
    } = require("../../cloudfunctions/quickstartFunctions/shared/outfits.js");

    test("normalizes outfit name and unique item order", () => {
      assert.deepEqual(
        normalizeOutfitInput({ name: "  粉色 约会  ", note: "  春天 ", itemIds: ["a", "b", "a"] }),
        {
          ok: true,
          name: "粉色 约会",
          note: "春天",
          itemIds: ["a", "b"],
          coverItemIds: ["a", "b"]
        }
      );
    });

    test("rejects outfit outside item limits", () => {
      assert.equal(normalizeOutfitInput({ name: "单件", itemIds: ["a"] }).code, "OUTFIT_TOO_SMALL");
      assert.equal(
        normalizeOutfitInput({ name: "太多", itemIds: Array.from({ length: 21 }, (_, i) => "i" + i) }).code,
        "OUTFIT_TOO_LARGE"
      );
    });

    test("merges without replacing current selection", () => {
      const result = buildOutfitMerge(
        ["existing", "duplicate"],
        ["duplicate", "available", "stored", "busy", "missing"],
        [
          { _id: "available", wearStatus: "available" },
          { _id: "stored", wearStatus: "stored" },
          { _id: "busy", wearStatus: "in_use" }
        ]
      );
      assert.deepEqual(result.selectedItemIds, ["existing", "duplicate", "available", "stored"]);
      assert.deepEqual(result.addedIds, ["available", "stored"]);
      assert.deepEqual(result.duplicateIds, ["duplicate"]);
      assert.deepEqual(result.inUseIds, ["busy"]);
      assert.deepEqual(result.missingIds, ["missing"]);
      assert.deepEqual(result.storedIds, ["stored"]);
    });

    test("creator and wardrobe owner can manage outfit", () => {
      const outfit = { createdByOpenId: "creator" };
      const wardrobe = { ownerOpenId: "owner" };
      assert.equal(canManageOutfit(outfit, wardrobe, "creator"), true);
      assert.equal(canManageOutfit(outfit, wardrobe, "owner"), true);
      assert.equal(canManageOutfit(outfit, wardrobe, "member"), false);
    });

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test miniprogram/tests/outfitDomain.test.js`

Expected: FAIL，错误包含 `Cannot find module .../shared/outfits.js`。

- [ ] **Step 3: 写最小领域实现**

在 `cloudfunctions/quickstartFunctions/shared/outfits.js` 写入：

    const MIN_OUTFIT_ITEMS = 2;
    const MAX_OUTFIT_ITEMS = 20;
    const MAX_OUTFITS_PER_WARDROBE = 50;

    function normalizeText(value) {
      return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    }

    function uniqueIds(ids) {
      const seen = new Set();
      return (ids || []).filter(id => {
        const value = normalizeText(id);
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      }).map(normalizeText);
    }

    function normalizeOutfitInput(input = {}) {
      const name = normalizeText(input.name).slice(0, 20);
      const note = normalizeText(input.note).slice(0, 60);
      const itemIds = uniqueIds(input.itemIds);
      if (!name) return { ok: false, code: "OUTFIT_NAME_REQUIRED" };
      if (itemIds.length < MIN_OUTFIT_ITEMS) return { ok: false, code: "OUTFIT_TOO_SMALL" };
      if (itemIds.length > MAX_OUTFIT_ITEMS) return { ok: false, code: "OUTFIT_TOO_LARGE" };
      return { ok: true, name, note, itemIds, coverItemIds: itemIds.slice(0, 3) };
    }

    function normalizeStatus(value) {
      if (value === "in_use" || value === "stored") return value;
      return "available";
    }

    function buildOutfitMerge(currentIds, outfitItemIds, items) {
      const selectedItemIds = uniqueIds(currentIds);
      const selected = new Set(selectedItemIds);
      const itemMap = new Map((items || []).map(item => [item._id, item]));
      const result = {
        selectedItemIds,
        addedIds: [],
        duplicateIds: [],
        inUseIds: [],
        missingIds: [],
        storedIds: []
      };
      uniqueIds(outfitItemIds).forEach(id => {
        if (selected.has(id)) {
          result.duplicateIds.push(id);
          return;
        }
        const item = itemMap.get(id);
        if (!item) {
          result.missingIds.push(id);
          return;
        }
        const status = normalizeStatus(item.wearStatus || item.status);
        if (status === "in_use") {
          result.inUseIds.push(id);
          return;
        }
        selected.add(id);
        result.selectedItemIds.push(id);
        result.addedIds.push(id);
        if (status === "stored") result.storedIds.push(id);
      });
      return result;
    }

    function canManageOutfit(outfit, wardrobe, openid) {
      if (!outfit || !wardrobe || !openid) return false;
      const owner = wardrobe.ownerOpenId || wardrobe.ownerOpenid || "";
      return outfit.createdByOpenId === openid || owner === openid;
    }

    module.exports = {
      MIN_OUTFIT_ITEMS,
      MAX_OUTFIT_ITEMS,
      MAX_OUTFITS_PER_WARDROBE,
      normalizeOutfitInput,
      buildOutfitMerge,
      canManageOutfit,
      uniqueIds
    };

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test miniprogram/tests/outfitDomain.test.js`

Expected: 4 tests PASS。

- [ ] **Step 5: 提交领域规则**

    git add cloudfunctions/quickstartFunctions/shared/outfits.js miniprogram/tests/outfitDomain.test.js
    git commit -m "feat(outfits): add validation and merge domain rules"

## Task 2：套装 CRUD 云函数

**Files:**
- Create: `cloudfunctions/quickstartFunctions/handlers/outfit.js`
- Modify: `cloudfunctions/quickstartFunctions/index.js`
- Modify: `cloudfunctions/quickstartFunctions/handlers/wardrobe.js`
- Create: `miniprogram/tests/outfitCloudContract.test.js`

- [ ] **Step 1: 写云函数契约失败测试**

测试读取源码并约束路由、集合和衣柜清理：

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const root = path.resolve(__dirname, "../..");
    const read = file => fs.readFileSync(path.join(root, file), "utf8");

    test("cloud entry registers outfit operations", () => {
      const source = read("cloudfunctions/quickstartFunctions/index.js");
      ["listOutfits", "getOutfit", "saveOutfit", "deleteOutfit"].forEach(name => {
        assert.match(source, new RegExp("\\b" + name + "\\b"));
      });
    });

    test("wardrobe deletion removes outfit documents", () => {
      const source = read("cloudfunctions/quickstartFunctions/handlers/wardrobe.js");
      assert.match(source, /getAllByWardrobe\("wardrobe_outfits"/);
      assert.match(source, /removeDocs\("wardrobe_outfits"/);
    });

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test miniprogram/tests/outfitCloudContract.test.js`

Expected: 2 tests FAIL，缺少套装路由和清理逻辑。

- [ ] **Step 3: 实现 CRUD handler**

在 `handlers/outfit.js` 中实现并导出 `listOutfits`、`getOutfit`、`saveOutfit`、`deleteOutfit`。共同流程必须是：

    const { cloud, db } = require("../shared/cloud.js");
    const { getWardrobeForUser } = require("../shared/access.js");
    const { fetchItemsByIds } = require("../shared/items.js");
    const {
      MAX_OUTFITS_PER_WARDROBE,
      normalizeOutfitInput,
      canManageOutfit
    } = require("../shared/outfits.js");

    function value(event, key) {
      return event[key] !== undefined ? event[key] : (event.data || {})[key];
    }

    async function requireAccess(event) {
      const wardrobeId = String(value(event, "wardrobeId") || "").trim();
      const context = cloud.getWXContext();
      const access = await getWardrobeForUser(wardrobeId, context.OPENID);
      return { wardrobeId, openid: context.OPENID, access };
    }

保存接口必须执行以下确定规则：

- 创建前统计同衣柜记录，达到 50 套返回 `OUTFIT_LIMIT_REACHED`。
- 所有 `itemIds` 必须存在且属于当前衣柜，否则返回 `OUTFIT_ITEM_NOT_FOUND`。
- 更新时只有创建者或衣柜主人可操作。
- 客户端 `version` 与服务端不一致时返回 `OUTFIT_VERSION_CONFLICT`。
- 创建版本为 1；每次更新版本加 1。
- 查询结果在云端按 `updateTime` 倒序排列后返回，最多 50 条。

保存记录使用：

    {
      wardrobeId,
      name: normalized.name,
      note: normalized.note,
      itemIds: normalized.itemIds,
      coverItemIds: normalized.coverItemIds,
      createdByOpenId: openid,
      createdByName: String(value(event, "createdByName") || "衣柜成员").trim().slice(0, 20),
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      version: 1
    }

列表接口为每个套装返回 `itemCount`，并批量补齐所有封面衣物；详情接口返回全部最新衣物和 `canManage`。

- [ ] **Step 4: 注册 CRUD 路由并清理衣柜套装**

在 `quickstartFunctions/index.js` 引入 handler，并只把四个已实现的 CRUD 方法加入 `handlers`。`applyOutfit` 在 Task 3 完成事务实现和失败测试后再注册，保证每次提交都不暴露未完成接口。

在 `deleteWardrobe` 中增加：

    const outfits = await getAllByWardrobe("wardrobe_outfits", wardrobeId);
    await removeDocs("wardrobe_outfits", outfits.map(item => item._id));

并在返回的 `deleted` 中增加 `outfits: outfits.length`。

- [ ] **Step 5: 运行契约和领域测试**

Run: `node --test miniprogram/tests/outfitDomain.test.js miniprogram/tests/outfitCloudContract.test.js`

Expected: 6 tests PASS。

- [ ] **Step 6: 提交 CRUD**

    git add cloudfunctions/quickstartFunctions/handlers/outfit.js cloudfunctions/quickstartFunctions/index.js cloudfunctions/quickstartFunctions/handlers/wardrobe.js miniprogram/tests/outfitCloudContract.test.js
    git commit -m "feat(outfits): add shared outfit CRUD"

## Task 3：云端原子合并

**Files:**
- Modify: `cloudfunctions/quickstartFunctions/handlers/outfit.js`
- Modify: `cloudfunctions/quickstartFunctions/index.js`
- Modify: `miniprogram/tests/outfitDomain.test.js`
- Modify: `miniprogram/tests/outfitCloudContract.test.js`

- [ ] **Step 1: 增加全重复、全部不可用和路由失败测试**

    test("returns unchanged selection when every outfit item is skipped", () => {
      const result = buildOutfitMerge(
        ["duplicate"],
        ["duplicate", "busy", "missing"],
        [{ _id: "busy", wearStatus: "in_use" }]
      );
      assert.deepEqual(result.selectedItemIds, ["duplicate"]);
      assert.deepEqual(result.addedIds, []);
      assert.equal(result.duplicateIds.length, 1);
      assert.equal(result.inUseIds.length, 1);
      assert.equal(result.missingIds.length, 1);
    });

在 `outfitCloudContract.test.js` 的路由名称数组中加入 `applyOutfit`。此时契约测试应失败，因为该路由尚未注册。

- [ ] **Step 2: 运行测试并确认领域测试通过、路由测试失败**

Run: `node --test miniprogram/tests/outfitDomain.test.js miniprogram/tests/outfitCloudContract.test.js`

Expected: 领域测试 5 项 PASS；云函数契约因缺少 `applyOutfit` 路由 FAIL。

- [ ] **Step 3: 实现并注册事务版 applyOutfit**

`applyOutfit` 的实现顺序必须如下：

    async function applyOutfit(event) {
      const { wardrobeId, openid, access } = await requireAccess(event);
      if (!access.ok) return { success: false, code: access.code };
      const outfitId = String(value(event, "outfitId") || "").trim();
      if (!outfitId) return { success: false, code: "MISSING_OUTFIT_ID" };

      try {
        const merge = await db.runTransaction(async transaction => {
          const outfitRes = await transaction.collection("wardrobe_outfits").doc(outfitId).get();
          const outfit = outfitRes.data;
          if (!outfit || outfit.wardrobeId !== wardrobeId) {
            const error = new Error("OUTFIT_NOT_FOUND");
            error.code = "OUTFIT_NOT_FOUND";
            throw error;
          }
          const hubRes = await transaction.collection("wardrobe_hubs").doc(wardrobeId).get();
          const wardrobe = hubRes.data;
          const items = [];
          for (const itemId of outfit.itemIds || []) {
            try {
              const itemRes = await transaction.collection("wardrobe_items").doc(itemId).get();
              if (itemRes.data && itemRes.data.wardrobeId === wardrobeId) items.push(itemRes.data);
            } catch (error) {}
          }
          const result = buildOutfitMerge(wardrobe.selectedItemIds || [], outfit.itemIds || [], items);
          await transaction.collection("wardrobe_hubs").doc(wardrobeId).update({
            data: {
              selectedItemIds: result.selectedItemIds,
              selectedUpdatedAt: db.serverDate(),
              selectedUpdatedText: String(value(event, "selectedUpdatedText") || "")
            }
          });
          return result;
        });
        return { success: true, ...merge, appliedByOpenId: openid };
      } catch (error) {
        return { success: false, code: error.code || "OUTFIT_APPLY_FAILED" };
      }
    }

确保文件顶部引入 `buildOutfitMerge`，在 `quickstartFunctions/index.js` 中导入并注册正式 `applyOutfit`。

- [ ] **Step 4: 运行测试**

Run: `node --test miniprogram/tests/outfitDomain.test.js miniprogram/tests/outfitCloudContract.test.js`

Expected: 7 tests PASS，云函数契约仍包含正式 `applyOutfit`。

- [ ] **Step 5: 提交原子合并**

    git add cloudfunctions/quickstartFunctions/handlers/outfit.js miniprogram/tests/outfitDomain.test.js
    git commit -m "feat(outfits): merge outfits into pick list atomically"

## Task 4：小程序 API、视图模型与缓存

**Files:**
- Create: `miniprogram/services/outfitApi.js`
- Create: `miniprogram/utils/outfitView.js`
- Create: `miniprogram/utils/outfitCache.js`
- Create: `miniprogram/tests/outfitView.test.js`

- [ ] **Step 1: 写视图模型失败测试**

    const test = require("node:test");
    const assert = require("node:assert/strict");
    const { decorateOutfit, formatApplyResult } = require("../utils/outfitView.js");

    test("decorates outfit permissions and three cover slots", () => {
      const outfit = decorateOutfit(
        { _id: "o1", name: "约会套装", itemIds: ["a", "b"], coverItems: [{ _id: "a", thumbUrl: "a.png" }], createdByOpenId: "u1" },
        { ownerOpenId: "owner" },
        "u1"
      );
      assert.equal(outfit.canManage, true);
      assert.equal(outfit.itemCount, 2);
      assert.equal(outfit.coverSlots.length, 3);
      assert.equal(outfit.coverSlots[1].empty, true);
    });

    test("formats merge summary", () => {
      assert.equal(
        formatApplyResult({ addedIds: ["a", "b"], duplicateIds: ["c"], inUseIds: ["d"], missingIds: [] }),
        "已加入 2 件，跳过 1 件重复衣物，1 件正在使用中未加入"
      );
      assert.equal(
        formatApplyResult({ addedIds: [], duplicateIds: ["a"], inUseIds: [], missingIds: [] }),
        "这套衣服已经都在清单里了"
      );
    });

- [ ] **Step 2: 运行并确认失败**

Run: `node --test miniprogram/tests/outfitView.test.js`

Expected: FAIL，缺少 `outfitView.js`。

- [ ] **Step 3: 实现视图模型**

`decorateOutfit` 必须输出 `itemCount`、固定三个带稳定 `key` 的 `coverSlots`、`canManage`、`needsCleanup` 和用于 WXML 的安全默认值。`formatApplyResult` 按“新增、重复、使用中、失效”顺序拼接中文反馈；零新增且只有重复时使用专用文案。

- [ ] **Step 4: 实现统一 API 调用**

`outfitApi.js` 使用一个私有调用器：

    async function call(type, data) {
      const response = await wx.cloud.callFunction({
        name: "quickstartFunctions",
        data: { type, ...data }
      });
      const result = response.result || {};
      if (!result.success) {
        const error = new Error(result.code || "OUTFIT_REQUEST_FAILED");
        error.code = result.code || "OUTFIT_REQUEST_FAILED";
        throw error;
      }
      return result;
    }

导出 `listOutfits`、`getOutfit`、`saveOutfit`、`deleteOutfit`、`applyOutfit`，每个方法只接受一个参数对象。

- [ ] **Step 5: 实现套装缓存**

`outfitCache.js` 复用 `pageCache.js`，缓存键固定为 `[openid, wardrobeId].join(":")`，最大缓存时间 30 分钟，并导出：

    getOutfitCache(user, wardrobeId)
    setOutfitCache(user, wardrobeId, outfits)
    removeOutfitCache(user, wardrobeId)

- [ ] **Step 6: 运行测试**

Run: `node --test miniprogram/tests/outfitView.test.js`

Expected: 2 tests PASS。

- [ ] **Step 7: 提交客户端基础层**

    git add miniprogram/services/outfitApi.js miniprogram/utils/outfitView.js miniprogram/utils/outfitCache.js miniprogram/tests/outfitView.test.js
    git commit -m "feat(outfits): add client API view model and cache"

## Task 5：首页任务页套装区与快速保存

**Files:**
- Create: `miniprogram/utils/indexOutfitActions.js`
- Create: `miniprogram/components/outfitSection/index.js`
- Create: `miniprogram/components/outfitSection/index.json`
- Create: `miniprogram/components/outfitSection/index.wxml`
- Create: `miniprogram/components/outfitSection/index.wxss`
- Create: `miniprogram/components/outfitDetailPanel/index.js`
- Create: `miniprogram/components/outfitDetailPanel/index.json`
- Create: `miniprogram/components/outfitDetailPanel/index.wxml`
- Create: `miniprogram/components/outfitDetailPanel/index.wxss`
- Create: `miniprogram/components/outfitQuickSave/index.js`
- Create: `miniprogram/components/outfitQuickSave/index.json`
- Create: `miniprogram/components/outfitQuickSave/index.wxml`
- Create: `miniprogram/components/outfitQuickSave/index.wxss`
- Modify: `miniprogram/pages/index/index.js`
- Modify: `miniprogram/pages/index/index.json`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/styles/base.wxss`
- Create: `miniprogram/tests/outfitMarkup.test.js`

- [ ] **Step 1: 写首页集成失败测试**

测试必须断言：

    const indexWxml = read("miniprogram/pages/index/index.wxml");
    const indexJson = read("miniprogram/pages/index/index.json");
    assert.match(indexWxml, /<outfit-section/);
    assert.match(indexWxml, /<outfit-detail-panel/);
    assert.match(indexWxml, /<outfit-quick-save/);
    assert.match(indexWxml, /bindtap="openQuickSaveOutfit"/);
    assert.match(indexJson, /"outfit-section"/);
    assert.match(indexJson, /"outfit-detail-panel"/);
    assert.match(indexJson, /"outfit-quick-save"/);

同时复用 `tests/ui-optimization.test.js` 的标签栈函数验证修改后的 `index.wxml`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test miniprogram/tests/outfitMarkup.test.js`

Expected: FAIL，首页尚未注册套装组件。

- [ ] **Step 3: 实现 indexOutfitActions**

模块导出以下方法并只通过传入的 `page` 改状态：

    hydrateOutfitCache(page)
    loadOutfits(page, options)
    openOutfitDetail(page, event)
    closeOutfitDetail(page)
    openQuickSaveOutfit(page)
    closeQuickSaveOutfit(page)
    saveQuickOutfit(page, event)
    applyCurrentOutfit(page)
    deleteCurrentOutfit(page)
    goCreateOutfit(page)
    goEditOutfit(page)
    applyOutfitMutationFromChild(page, change)

`loadOutfits` 先展示缓存，再静默调用 `outfitApi.listOutfits`；失败时设置 `outfitLoadError: true`，不影响任务列表。`applyCurrentOutfit` 成功后必须用云端返回的 `selectedItemIds` 调用现有 `setSelection(ids, false)`，再显示 `formatApplyResult`。

- [ ] **Step 4: 在 index.js 增加状态和委托**

`data` 增加：

    outfits: [],
    outfitsLoading: false,
    outfitLoadError: false,
    selectedOutfit: null,
    showOutfitDetail: false,
    showOutfitQuickSave: false,
    outfitSaving: false,
    outfitApplying: false

在 `switchTab` 完成后，当 `tab === 2` 且尚未加载时调用 `this.loadOutfits()`。页面为上述动作（包括 `applyOutfitMutationFromChild`）提供同名委托，不在 `index.js` 复制 API 逻辑。

- [ ] **Step 5: 创建三个组件**

`outfitSection` 属性为 `outfits/loading/error`，事件为 `create/open/retry`。WXML 必须包含：

    <view class="outfit-section">
      <view class="outfit-section-head">
        <text class="outfit-section-title">我的套装</text>
        <view class="outfit-create-hit" bindtap="createOutfit"><view class="outfit-create">＋ 新建</view></view>
      </view>
      <scroll-view class="outfit-strip" scroll-x show-scrollbar="{{false}}" wx:if="{{outfits.length}}">
        <view class="outfit-card" wx:for="{{outfits}}" wx:key="_id" data-id="{{item._id}}" bindtap="openOutfit">
          <view class="outfit-cover"><image lazy-load mode="aspectFill" src="{{cover.url}}" wx:for="{{item.coverSlots}}" wx:for-item="cover" wx:key="key"></image></view>
          <text class="outfit-name">{{item.name}}</text>
          <text class="outfit-meta">{{item.itemCount}} 件 · {{item.createdByName}}</text>
          <text class="outfit-warning" wx:if="{{item.needsCleanup}}">需整理</text>
        </view>
      </scroll-view>
      <view class="outfit-empty" wx:elif="{{!loading && !error}}">还没有套装，从当前拿衣清单保存一套吧</view>
      <view class="outfit-error" bindtap="retry" wx:elif="{{error}}">加载失败，点击重试</view>
    </view>

`outfitDetailPanel` 提供 `apply/edit/delete/close` 事件；`outfitQuickSave` 内部维护名称和备注输入，并在 `confirm` 事件中返回 `{ name, note }`。

- [ ] **Step 6: 接入任务页和拿衣面板**

在任务页的拿衣包裹后、任务输入前插入 `outfit-section`。在拿衣面板操作区增加次要按钮：

    <view bindtap="openQuickSaveOutfit" class="pick-action-outfit">存为套装</view>

并在页面底部挂载详情与快速保存组件。保留现有“清空清单”和“保存清单”事件。

- [ ] **Step 7: 添加布局与安全区样式**

`base.wxss` 只负责三个操作按钮的父级分配和任务分区间距；组件视觉写在各自 WXSS。所有新建、关闭、应用按钮的命中区使用 `var(--touch-target)`，底部面板 padding 包含 `env(safe-area-inset-bottom)`。

- [ ] **Step 8: 运行标记和回归测试**

Run: `node --test miniprogram/tests/outfitMarkup.test.js tests/ui-optimization.test.js`

Expected: 所有测试 PASS，包含 index WXML 嵌套检查。

- [ ] **Step 9: 提交首页集成**

    git add miniprogram/utils/indexOutfitActions.js miniprogram/components/outfitSection miniprogram/components/outfitDetailPanel miniprogram/components/outfitQuickSave miniprogram/pages/index/index.js miniprogram/pages/index/index.json miniprogram/pages/index/index.wxml miniprogram/pages/index/styles/base.wxss miniprogram/tests/outfitMarkup.test.js
    git commit -m "feat(outfits): add outfit center to task tab"

## Task 6：独立套装编辑页

**Files:**
- Create: `miniprogram/pages/outfit-edit/outfit-edit.js`
- Create: `miniprogram/pages/outfit-edit/outfit-edit.json`
- Create: `miniprogram/pages/outfit-edit/outfit-edit.wxml`
- Create: `miniprogram/pages/outfit-edit/outfit-edit.wxss`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/tests/outfitMarkup.test.js`

- [ ] **Step 1: 增加编辑页失败测试**

断言 `app.json` 包含 `pages/outfit-edit/outfit-edit`，编辑页 WXML 包含名称输入、备注输入、分类、已选计数、衣物选择按钮和固定保存按钮：

    ["outfit-name-input", "outfit-note-input", "outfit-category", "outfit-selected-count", "outfit-item-check", "outfit-save"].forEach(name => {
      assert.match(editorWxml, new RegExp(name));
    });

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test miniprogram/tests/outfitMarkup.test.js`

Expected: FAIL，编辑页尚不存在。

- [ ] **Step 3: 注册页面并实现加载**

页面参数为 `wardrobeId` 和可选 `outfitId`。新建时分页加载衣柜全部衣物；编辑时并行加载套装详情。数据至少包含：

    wardrobeId: "",
    outfitId: "",
    version: 0,
    name: "",
    note: "",
    allItems: [],
    groupedItems: [],
    selectedItemIds: [],
    selectedCategory: "",
    loading: true,
    loadError: false,
    saving: false

分页使用现有 `wardrobeIndexApi.fetchItemsPage`，每页 50 件，直到 `hasMore === false`。每页到达后增量更新界面，避免长时间空白。

- [ ] **Step 4: 实现选择与校验**

`toggleItem` 必须保持顺序、去重并限制最多 20 件；达到上限显示 `一套最多选择 20 件衣物`。保存前检查：

    if (!normalizedName) return "请填写套装名称";
    if (selectedItemIds.length < 2) return "至少选择两件衣物";
    if (selectedItemIds.length > 20) return "一套最多选择 20 件衣物";

使用中衣物仍可保存在长期套装里，但卡片显示“使用中”；应用套装时由云端跳过。

- [ ] **Step 5: 实现保存和返回同步**

保存调用 `outfitApi.saveOutfit`，传入 `wardrobeId/outfitId/version/name/note/itemIds/createdByName`。成功后清除套装缓存，向前一页调用 `applyOutfitMutationFromChild({ type: "upsert", outfit })`；找不到该方法时返回后由首页 `onShow` 静默刷新。

保存失败映射明确文案：

- `OUTFIT_VERSION_CONFLICT`：套装已被其他成员更新，请返回后重新打开。
- `OUTFIT_LIMIT_REACHED`：这个衣柜最多保存 50 套。
- `OUTFIT_ITEM_NOT_FOUND`：部分衣物已不存在，请重新选择。
- 其他错误：保存失败，请重试。

- [ ] **Step 6: 实现 WXML/WXSS**

页面沿用现有 `kawaii-back`、卡片、分类 chip 和固定保存按钮。输入设置 `adjust-position="true"` 与足够 `cursor-spacing`；滚动区尾部 spacer 必须大于保存按钮和安全区总高度。

- [ ] **Step 7: 运行测试**

Run: `node --test miniprogram/tests/outfitMarkup.test.js tests/ui-optimization.test.js`

Expected: 全部 PASS。

- [ ] **Step 8: 提交编辑页**

    git add miniprogram/pages/outfit-edit miniprogram/app.json miniprogram/tests/outfitMarkup.test.js
    git commit -m "feat(outfits): add dedicated outfit editor"

## Task 7：删除联动、缓存同步与错误恢复

**Files:**
- Modify: `cloudfunctions/quickstartFunctions/handlers/item.js`
- Modify: `miniprogram/utils/indexCache.js`
- Modify: `miniprogram/utils/indexOutfitActions.js`
- Modify: `miniprogram/tests/outfitCloudContract.test.js`
- Modify: `miniprogram/tests/outfitView.test.js`

- [ ] **Step 1: 写衣物删除联动失败测试**

契约测试断言 `deleteItem` 查询 `wardrobe_outfits` 并把含该衣物的套装更新为 `needsCleanup: true`。视图测试断言该字段生成“需整理”状态。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test miniprogram/tests/outfitCloudContract.test.js miniprogram/tests/outfitView.test.js`

Expected: FAIL，删除衣物尚未标记套装。

- [ ] **Step 3: 实现删除联动**

衣物删除成功后查询同衣柜套装，筛选 `itemIds.indexOf(itemId) >= 0` 的记录，并批量更新：

    {
      needsCleanup: true,
      updateTime: db.serverDate(),
      version: db.command.inc(1)
    }

查询最多 50 套，符合已确认上限。删除衣物主流程不能因为标记套装失败而回滚；捕获错误并记录 `console.error("mark outfit cleanup failed", error)`。

- [ ] **Step 4: 实现首页本地同步**

`applyOutfitMutationFromChild` 对 upsert/delete 更新 `outfits` 数组并刷新缓存。衣物删除回到首页时移除衣物缓存，同时把本地含该 ID 的套装标记 `needsCleanup: true`。

- [ ] **Step 5: 完成错误恢复**

- 套装加载失败显示重试入口。
- 快速保存失败保持名称、备注和当前拿衣清单。
- 应用失败不调用 `setSelection`。
- 删除失败保持详情面板打开。
- 全部重复显示专用文案。
- 全部不可用显示“套装中的衣物当前都无法加入清单”。

- [ ] **Step 6: 运行测试**

Run: `node --test miniprogram/tests/outfitCloudContract.test.js miniprogram/tests/outfitView.test.js miniprogram/tests/outfitMarkup.test.js`

Expected: 全部 PASS。

- [ ] **Step 7: 提交加固**

    git add cloudfunctions/quickstartFunctions/handlers/item.js miniprogram/utils/indexCache.js miniprogram/utils/indexOutfitActions.js miniprogram/tests/outfitCloudContract.test.js miniprogram/tests/outfitView.test.js
    git commit -m "fix(outfits): sync deleted items and recover failed actions"

## Task 8：最终验证与部署准备

**Files:**
- Modify: `README.md`
- Verify: all changed files

- [ ] **Step 1: 运行全部自动测试**

Run: `node --test miniprogram/tests/*.test.js tests/*.test.js`

Expected: 现有测试与新增套装测试全部 PASS，零失败。

- [ ] **Step 2: 检查 WXML 与补丁格式**

Run: `git diff --check`

Expected: 退出码 0；允许 Windows 的 LF/CRLF 提示，但不允许空白错误。

- [ ] **Step 3: 运行 Impeccable 检测**

Run:

    node C:\Users\GaoRuoHeng\.codex\skills\impeccable\scripts\detect.mjs --json miniprogram/pages/index/index.wxml miniprogram/pages/index/styles/base.wxss miniprogram/pages/outfit-edit/outfit-edit.wxml miniprogram/pages/outfit-edit/outfit-edit.wxss miniprogram/components/outfitSection/index.wxml miniprogram/components/outfitDetailPanel/index.wxml miniprogram/components/outfitQuickSave/index.wxml

Expected: `[]`，或每一项都经过人工确认并修复真实问题。

- [ ] **Step 4: 微信开发者工具手工验收**

按顺序验证：

1. 两件衣物快速保存为套装，拿衣清单不变化。
2. 独立编辑页创建 20 件套装、修改名称并返回。
3. 普通共享成员可使用但看不到编辑和删除。
4. 套装与现有拿衣清单合并，重复项不增加。
5. 使用中跳过、已收纳加入并提示、已删除标记需整理。
6. 两个成员先后使用不同套装，最终清单包含双方有效选择。
7. 断网保存失败后输入仍在，恢复网络可重试。
8. iPhone 全面屏模拟器中底部按钮不被安全区遮挡。

- [ ] **Step 5: 更新部署说明**

在 README 增加“套装功能部署”小节，明确：

- 创建云数据库集合 `wardrobe_outfits`。
- 部署 `quickstartFunctions` 云函数并选择云端安装依赖。
- 在开发者工具重新编译小程序。
- 用两个共享账号完成一次合并验证。

- [ ] **Step 6: 提交部署文档**

    git add README.md
    git commit -m "docs: add outfit deployment and verification steps"

- [ ] **Step 7: 最终状态检查**

Run: `git status -sb`

Expected: 只保留实施开始前就存在、且与套装无关的用户修改；套装功能相关文件全部已提交。
