const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

const ensureCollection = async (name) => {
  try {
    await db.createCollection(name);
  } catch (e) {}
};

const PAGE_SIZE = 100;
const DELETE_FILE_BATCH_SIZE = 50;
const DELETE_DOC_BATCH_SIZE = 20;

function chunkList(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isCloudFileId(value) {
  return normalizeText(value).indexOf("cloud://") === 0;
}

async function getAllByWardrobe(collectionName, wardrobeId) {
  let skip = 0;
  let result = [];

  while (true) {
    const res = await db.collection(collectionName)
      .where({ wardrobeId })
      .skip(skip)
      .limit(PAGE_SIZE)
      .get();
    const page = res.data || [];
    result = result.concat(page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return result;
}

async function removeDocs(collectionName, ids) {
  const cleanIds = (ids || []).filter(id => !!id);
  const chunks = chunkList(cleanIds, DELETE_DOC_BATCH_SIZE);

  for (let index = 0; index < chunks.length; index += 1) {
    await Promise.all(chunks[index].map(id =>
      db.collection(collectionName).doc(id).remove()
    ));
  }
}

async function deleteCloudFiles(fileList) {
  const uniqueMap = {};
  (fileList || []).forEach(fileId => {
    if (isCloudFileId(fileId)) uniqueMap[fileId] = true;
  });

  const uniqueFiles = Object.keys(uniqueMap);
  let deletedCount = 0;
  let failedCount = 0;
  const chunks = chunkList(uniqueFiles, DELETE_FILE_BATCH_SIZE);

  for (let index = 0; index < chunks.length; index += 1) {
    try {
      const res = await cloud.deleteFile({ fileList: chunks[index] });
      const fileResults = res.fileList || [];
      const chunkDeletedCount = fileResults.length > 0
        ? fileResults.filter(item => item && item.status === 0).length
        : chunks[index].length;
      deletedCount += chunkDeletedCount;
      failedCount += chunks[index].length - chunkDeletedCount;
    } catch (err) {
      console.error("delete wardrobe cloud files failed", err);
      failedCount += chunks[index].length;
    }
  }

  return {
    total: uniqueFiles.length,
    deletedCount,
    failedCount
  };
}

function collectItemFileIds(items) {
  const fileIds = [];
  (items || []).forEach(item => {
    if (isCloudFileId(item.url)) fileIds.push(item.url);
    if (isCloudFileId(item.thumbUrl)) fileIds.push(item.thumbUrl);
  });
  return fileIds;
}

const STATUS_AVAILABLE = "available";
const STATUS_IN_USE = "in_use";
const STATUS_STORED = "stored";
const DEFAULT_ITEM_NAME = "未命名单品";
const DEFAULT_ITEM_IMAGE = "/images/default-goods-image.png";
const DEFAULT_CATEGORIES = ["上衣", "下装", "连衣裙", "鞋子", "配饰"];
const ADMIN_PASSWORD = "20060216";

function normalizeItemStatus(value) {
  if (value === STATUS_IN_USE || value === "using" || value === "使用中") {
    return STATUS_IN_USE;
  }
  if (value === STATUS_STORED || value === "packed" || value === "已收纳" || value === "已收钠") {
    return STATUS_STORED;
  }
  return STATUS_AVAILABLE;
}

function uniqueIds(ids) {
  const result = [];
  (ids || []).forEach(id => {
    const value = normalizeText(id);
    if (value && result.indexOf(value) === -1) result.push(value);
  });
  return result;
}

function canAccessWardrobe(wardrobe, openid) {
  if (!wardrobe || !openid) return false;
  const ownerOpenId = wardrobe.ownerOpenId || wardrobe.ownerOpenid || "";
  if (ownerOpenId === openid) return true;
  if ((wardrobe.sharedOpenIds || []).indexOf(openid) >= 0) return true;
  return (wardrobe.sharedUsers || []).some(item => item && item.openid === openid);
}

async function getWardrobeForUser(wardrobeId, openid) {
  if (!wardrobeId || !openid) {
    return { ok: false, code: "MISSING_WARDROBE_ID" };
  }

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    if (!canAccessWardrobe(hubRes.data, openid)) {
      return { ok: false, code: "FORBIDDEN" };
    }
    return { ok: true, wardrobe: hubRes.data };
  } catch (err) {
    return { ok: false, code: "WARDROBE_NOT_FOUND" };
  }
}

async function getWardrobeForAdmin(wardrobeId) {
  if (!wardrobeId) {
    return { ok: false, code: "MISSING_WARDROBE_ID" };
  }

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    return { ok: true, wardrobe: hubRes.data };
  } catch (err) {
    return { ok: false, code: "WARDROBE_NOT_FOUND" };
  }
}

async function getItemForUser(itemId, wardrobeId, openid) {
  const access = await getWardrobeForUser(wardrobeId, openid);
  if (!access.ok) return access;

  try {
    const itemRes = await db.collection("wardrobe_items").doc(itemId).get();
    const item = itemRes.data;
    if (!item || item.wardrobeId !== wardrobeId) {
      return { ok: false, code: "ITEM_NOT_FOUND" };
    }
    return { ok: true, wardrobe: access.wardrobe, item };
  } catch (err) {
    return { ok: false, code: "ITEM_NOT_FOUND" };
  }
}

function collectUnusedItemFiles(oldItem, nextData) {
  const oldFiles = collectItemFileIds([oldItem]);
  const nextFiles = collectItemFileIds([nextData]);
  return oldFiles.filter(fileId => nextFiles.indexOf(fileId) < 0);
}

async function updateWardrobeUpdatedAt(wardrobeId, extraData = {}) {
  await db.collection("wardrobe_hubs").doc(wardrobeId).update({
    data: {
      ...extraData,
      updatedAt: db.serverDate()
    }
  });
}

async function ensureCategory(wardrobeId, name, ownerOpenId, sortOrder) {
  const categoryName = normalizeText(name);
  if (!wardrobeId || !categoryName) return null;

  const existed = await db.collection("wardrobe_categories")
    .where({ wardrobeId, name: categoryName })
    .limit(1)
    .get();
  if (existed.data && existed.data.length > 0) return existed.data[0];

  let nextSortOrder = sortOrder;
  if (typeof nextSortOrder !== "number") {
    const countRes = await db.collection("wardrobe_categories")
      .where({ wardrobeId })
      .count();
    nextSortOrder = countRes.total || 0;
  }

  const addRes = await db.collection("wardrobe_categories").add({
    data: {
      name: categoryName,
      wardrobeId,
      ownerOpenId,
      sort_order: nextSortOrder,
      itemCount: 0,
      createTime: db.serverDate()
    }
  });

  return {
    _id: addRes._id,
    name: categoryName,
    wardrobeId,
    ownerOpenId,
    sort_order: nextSortOrder,
    itemCount: 0
  };
}

async function getCategoryItemCount(wardrobeId, categoryName) {
  const countRes = await db.collection("wardrobe_items")
    .where({ wardrobeId, category: categoryName })
    .count();
  return countRes.total || 0;
}

async function resolveCategoryCount(wardrobeId, category) {
  if (typeof category.itemCount === "number") return category.itemCount;
  if (typeof category.count === "number") return category.count;

  const itemCount = await getCategoryItemCount(wardrobeId, category.name);
  try {
    await db.collection("wardrobe_categories").doc(category._id).update({
      data: { itemCount }
    });
  } catch (err) {
    console.error("backfill category count failed", err);
  }
  return itemCount;
}

async function normalizeCategoriesWithCounts(wardrobeId, categories) {
  return await Promise.all((categories || []).map(async (category, index) => {
    const itemCount = await resolveCategoryCount(wardrobeId, category);
    return {
      ...category,
      itemCount,
      count: itemCount,
      sort_order: typeof category.sort_order === "number" ? category.sort_order : index
    };
  }));
}

async function adjustCategoryItemCount(wardrobeId, categoryName, delta) {
  const name = normalizeText(categoryName);
  if (!wardrobeId || !name || !delta) return;
  try {
    await db.collection("wardrobe_categories")
      .where({ wardrobeId, name })
      .update({
        data: {
          itemCount: _.inc(delta)
        }
      });
  } catch (err) {
    console.error("adjust category item count failed", err);
  }
}

async function createDefaultCategoriesForWardrobe(wardrobeId, ownerOpenId) {
  await Promise.all(DEFAULT_CATEGORIES.map((name, index) =>
    ensureCategory(wardrobeId, name, ownerOpenId, index)
  ));
  const catRes = await db.collection("wardrobe_categories")
    .where({ wardrobeId })
    .orderBy("sort_order", "asc")
    .get();
  return catRes.data || [];
}

async function fetchItemsByIds(ids, wardrobeId) {
  const cleanIds = uniqueIds(ids);
  if (cleanIds.length === 0) return [];

  const results = [];
  for (let index = 0; index < cleanIds.length; index += 1) {
    try {
      const itemRes = await db.collection("wardrobe_items").doc(cleanIds[index]).get();
      const item = itemRes.data;
      if (item && item.wardrobeId === wardrobeId) results.push(item);
    } catch (err) {}
  }
  return results;
}

function mergeUniqueItems(groups) {
  const seen = {};
  const result = [];
  (groups || []).forEach(group => {
    (group || []).forEach(item => {
      if (!item || !item._id || seen[item._id]) return;
      seen[item._id] = true;
      result.push(item);
    });
  });
  return result;
}

async function getWardrobeSnapshot(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const mode = normalizeText(event.mode || data.mode) || "index";
  const firstCategory = normalizeText(event.firstCategory || data.firstCategory);
  const firstLimitRaw = Number(event.firstLimit || data.firstLimit || 20);
  const firstLimit = Math.max(1, Math.min(firstLimitRaw || 20, 50));
  const adminPassword = event.adminPassword || data.adminPassword || "";
  const wxContext = cloud.getWXContext();
  const access = adminPassword === ADMIN_PASSWORD
    ? await getWardrobeForAdmin(wardrobeId)
    : await getWardrobeForUser(wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  let catRes = await db.collection("wardrobe_categories")
    .where({ wardrobeId })
    .orderBy("sort_order", "asc")
    .get();
  let categories = catRes.data || [];
  if (categories.length === 0) {
    const ownerOpenId = access.wardrobe.ownerOpenId || access.wardrobe.ownerOpenid || wxContext.OPENID;
    categories = await createDefaultCategoriesForWardrobe(wardrobeId, ownerOpenId);
  }

  const normalizedCategories = await normalizeCategoriesWithCounts(wardrobeId, categories);
  const categoryNames = normalizedCategories.map(category => category.name).filter(name => !!name);
  const totalItems = normalizedCategories.reduce((sum, category) => sum + (category.itemCount || 0), 0);

  if (mode === "manage") {
    return {
      success: true,
      wardrobe: access.wardrobe,
      categories: normalizedCategories,
      categoryNames,
      totalItems,
      items: [],
      allItemsLoaded: true
    };
  }

  const targetCategory = firstCategory && categoryNames.indexOf(firstCategory) >= 0
    ? firstCategory
    : categoryNames[0] || "";
  const selectedItemIds = access.wardrobe.selectedItemIds || [];
  const firstItemsPromise = targetCategory
    ? db.collection("wardrobe_items")
      .where({ wardrobeId, category: targetCategory })
      .orderBy("sort_order", "asc")
      .limit(firstLimit)
      .get()
      .then(res => res.data || [])
    : Promise.resolve([]);
  const selectedItemsPromise = fetchItemsByIds(selectedItemIds, wardrobeId);
  const results = await Promise.all([firstItemsPromise, selectedItemsPromise]);
  const items = mergeUniqueItems(results);

  return {
    success: true,
    wardrobe: access.wardrobe,
    categories: normalizedCategories,
    categoryNames,
    totalItems,
    items,
    selectedItems: results[1],
    priorityCategory: targetCategory,
    allItemsLoaded: totalItems <= items.length
  };
}

async function getWardrobeItemsPage(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const skipRaw = Number(event.skip || data.skip || 0);
  const limitRaw = Number(event.limit || data.limit || 20);
  const skip = Math.max(0, skipRaw || 0);
  const limit = Math.max(1, Math.min(limitRaw || 20, 50));
  const adminPassword = event.adminPassword || data.adminPassword || "";
  const wxContext = cloud.getWXContext();
  const access = adminPassword === ADMIN_PASSWORD
    ? await getWardrobeForAdmin(wardrobeId)
    : await getWardrobeForUser(wardrobeId, wxContext.OPENID);

  if (!access.ok) return { success: false, code: access.code };

  const res = await db.collection("wardrobe_items")
    .where({ wardrobeId })
    .skip(skip)
    .limit(limit)
    .orderBy("sort_order", "asc")
    .get();

  return {
    success: true,
    items: res.data || [],
    skip,
    limit
  };
}

async function createItem(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const itemData = data.item || event.item || {};
  const category = normalizeText(itemData.category) || "未分类";
  const wxContext = cloud.getWXContext();
  const access = await getWardrobeForUser(wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  const ownerOpenId = access.wardrobe.ownerOpenId || access.wardrobe.ownerOpenid || wxContext.OPENID;
  const targetCategory = await ensureCategory(wardrobeId, category, ownerOpenId);
  const sortOrder = typeof targetCategory.itemCount === "number"
    ? targetCategory.itemCount
    : await getCategoryItemCount(wardrobeId, category);
  const nextData = {
    name: normalizeText(itemData.name) || DEFAULT_ITEM_NAME,
    category,
    color: normalizeText(itemData.color),
    notes: normalizeText(itemData.notes),
    url: normalizeText(itemData.url) || DEFAULT_ITEM_IMAGE,
    thumbUrl: normalizeText(itemData.thumbUrl || itemData.url) || DEFAULT_ITEM_IMAGE,
    wardrobeId,
    ownerOpenId,
    createdByOpenId: wxContext.OPENID,
    wearStatus: normalizeItemStatus(itemData.wearStatus || STATUS_AVAILABLE),
    sort_order: sortOrder,
    createTime: db.serverDate(),
    updatedAt: db.serverDate()
  };

  const addRes = await db.collection("wardrobe_items").add({ data: nextData });
  await adjustCategoryItemCount(wardrobeId, category, 1);
  await updateWardrobeUpdatedAt(wardrobeId);

  return {
    success: true,
    item: {
      ...nextData,
      _id: addRes._id,
      createTime: Date.now(),
      updatedAt: Date.now()
    }
  };
}

async function updateItem(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const itemId = normalizeText(event.itemId || data.itemId);
  const wxContext = cloud.getWXContext();
  const access = await getItemForUser(itemId, wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  const itemData = data.item || event.item || {};
  const category = normalizeText(itemData.category || access.item.category);
  const nextData = {
    name: normalizeText(itemData.name) || DEFAULT_ITEM_NAME,
    color: normalizeText(itemData.color),
    category,
    notes: normalizeText(itemData.notes),
    url: normalizeText(itemData.url) || DEFAULT_ITEM_IMAGE,
    thumbUrl: normalizeText(itemData.thumbUrl || itemData.url) || DEFAULT_ITEM_IMAGE,
    updatedAt: db.serverDate()
  };

  if (category !== access.item.category) {
    const ownerOpenId = access.wardrobe.ownerOpenId || access.wardrobe.ownerOpenid || wxContext.OPENID;
    const targetCategory = await ensureCategory(wardrobeId, category, ownerOpenId);
    nextData.sort_order = typeof targetCategory.itemCount === "number"
      ? targetCategory.itemCount
      : await getCategoryItemCount(wardrobeId, category);
  }

  await db.collection("wardrobe_items").doc(itemId).update({ data: nextData });
  if (category !== access.item.category) {
    await Promise.all([
      adjustCategoryItemCount(wardrobeId, access.item.category, -1),
      adjustCategoryItemCount(wardrobeId, category, 1)
    ]);
  }
  await updateWardrobeUpdatedAt(wardrobeId);
  const fileResult = await deleteCloudFiles(collectUnusedItemFiles(access.item, nextData));

  return {
    success: true,
    item: {
      ...access.item,
      ...nextData,
      _id: itemId,
      updatedAt: Date.now()
    },
    deletedFiles: fileResult
  };
}

async function deleteItem(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const itemId = normalizeText(event.itemId || data.itemId);
  const wxContext = cloud.getWXContext();
  const access = await getItemForUser(itemId, wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  const selectedItemIds = (access.wardrobe.selectedItemIds || []).filter(id => id !== itemId);
  const selectionChanged = selectedItemIds.length !== (access.wardrobe.selectedItemIds || []).length;
  const hubData = {};
  if (selectionChanged) {
    hubData.selectedItemIds = selectedItemIds;
    hubData.selectedUpdatedAt = db.serverDate();
    const selectedUpdatedText = normalizeText(event.selectedUpdatedText || data.selectedUpdatedText);
    if (selectedUpdatedText) hubData.selectedUpdatedText = selectedUpdatedText;
  }

  const fileResult = await deleteCloudFiles(collectItemFileIds([access.item]));
  await db.collection("wardrobe_items").doc(itemId).remove();
  await adjustCategoryItemCount(wardrobeId, access.item.category, -1);
  await updateWardrobeUpdatedAt(wardrobeId, hubData);

  return {
    success: true,
    selectedItemIds,
    deleted: {
      item: 1,
      files: fileResult,
      selectionChanged
    }
  };
}

async function updateItemStatus(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const itemId = normalizeText(event.itemId || data.itemId);
  const wearStatus = normalizeItemStatus(event.status || data.status);
  const selectedUpdatedText = normalizeText(event.selectedUpdatedText || data.selectedUpdatedText);
  const wxContext = cloud.getWXContext();
  const access = await getItemForUser(itemId, wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  await db.collection("wardrobe_items").doc(itemId).update({
    data: {
      wearStatus,
      updatedAt: db.serverDate(),
      statusUpdatedAt: db.serverDate()
    }
  });

  let selectedItemIds = access.wardrobe.selectedItemIds || [];
  let selectionChanged = false;
  if (wearStatus === STATUS_IN_USE && selectedItemIds.indexOf(itemId) >= 0) {
    selectedItemIds = selectedItemIds.filter(id => id !== itemId);
    selectionChanged = true;
    const hubData = {
      selectedItemIds,
      selectedUpdatedAt: db.serverDate()
    };
    if (selectedUpdatedText) hubData.selectedUpdatedText = selectedUpdatedText;
    await updateWardrobeUpdatedAt(wardrobeId, hubData);
  } else {
    await updateWardrobeUpdatedAt(wardrobeId);
  }

  return {
    success: true,
    wearStatus,
    selectedItemIds,
    selectionChanged
  };
}

async function saveSelectedItems(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const selectedItemIds = uniqueIds(event.selectedItemIds || data.selectedItemIds);
  const selectedUpdatedText = normalizeText(event.selectedUpdatedText || data.selectedUpdatedText);
  const wxContext = cloud.getWXContext();
  const access = await getWardrobeForUser(wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  const validIds = [];
  for (let index = 0; index < selectedItemIds.length; index += 1) {
    try {
      const itemRes = await db.collection("wardrobe_items").doc(selectedItemIds[index]).get();
      const item = itemRes.data;
      if (item && item.wardrobeId === wardrobeId && normalizeItemStatus(item.wearStatus || item.status) !== STATUS_IN_USE) {
        validIds.push(selectedItemIds[index]);
      }
    } catch (err) {}
  }

  await updateWardrobeUpdatedAt(wardrobeId, {
    selectedItemIds: validIds,
    selectedUpdatedAt: db.serverDate(),
    selectedUpdatedText
  });

  return {
    success: true,
    selectedItemIds: validIds,
    selectedUpdatedText
  };
}

async function setItemSelection(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const itemId = normalizeText(event.itemId || data.itemId);
  const selected = !!(event.selected !== undefined ? event.selected : data.selected);
  const selectedUpdatedText = normalizeText(event.selectedUpdatedText || data.selectedUpdatedText);
  const wxContext = cloud.getWXContext();
  const access = await getItemForUser(itemId, wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };

  if (selected && normalizeItemStatus(access.item.wearStatus || access.item.status) === STATUS_IN_USE) {
    return { success: false, code: "ITEM_IN_USE" };
  }

  let selectedItemIds = uniqueIds(access.wardrobe.selectedItemIds || []);
  const existed = selectedItemIds.indexOf(itemId) >= 0;
  if (selected && !existed) {
    selectedItemIds.push(itemId);
  }
  if (!selected && existed) {
    selectedItemIds = selectedItemIds.filter(id => id !== itemId);
  }

  const hubData = {
    selectedItemIds,
    selectedUpdatedAt: db.serverDate()
  };
  if (selectedUpdatedText) hubData.selectedUpdatedText = selectedUpdatedText;
  await updateWardrobeUpdatedAt(wardrobeId, hubData);

  return {
    success: true,
    selectedItemIds,
    selectedUpdatedText
  };
}

async function saveItemOrder(event) {
  const data = event.data || {};
  const wardrobeId = normalizeText(event.wardrobeId || data.wardrobeId);
  const category = normalizeText(event.category || data.category);
  const itemIds = uniqueIds(event.itemIds || data.itemIds);
  const wxContext = cloud.getWXContext();
  const access = await getWardrobeForUser(wardrobeId, wxContext.OPENID);
  if (!access.ok) return { success: false, code: access.code };
  if (!category || itemIds.length === 0) {
    return { success: false, code: "MISSING_ORDER_DATA" };
  }

  for (let index = 0; index < itemIds.length; index += 1) {
    const itemRes = await db.collection("wardrobe_items").doc(itemIds[index]).get();
    const item = itemRes.data;
    if (!item || item.wardrobeId !== wardrobeId || item.category !== category) {
      return { success: false, code: "ITEM_NOT_FOUND" };
    }
  }

  const chunks = chunkList(itemIds, DELETE_DOC_BATCH_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    await Promise.all(chunks[chunkIndex].map((id, index) =>
      db.collection("wardrobe_items").doc(id).update({
        data: {
          sort_order: chunkIndex * DELETE_DOC_BATCH_SIZE + index,
          updatedAt: db.serverDate()
        }
      })
    ));
  }
  await updateWardrobeUpdatedAt(wardrobeId);

  return {
    success: true,
    itemIds
  };
}

const deleteWardrobe = async (event) => {
  const wardrobeId = normalizeText(event.wardrobeId || event.data && event.data.wardrobeId);
  if (!wardrobeId) {
    return { success: false, code: "MISSING_WARDROBE_ID" };
  }

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  let wardrobe = null;

  try {
    const hubRes = await db.collection("wardrobe_hubs").doc(wardrobeId).get();
    wardrobe = hubRes.data;
  } catch (err) {
    return { success: false, code: "WARDROBE_NOT_FOUND" };
  }

  const ownerOpenId = wardrobe && (wardrobe.ownerOpenId || wardrobe.ownerOpenid || "");
  if (!ownerOpenId || ownerOpenId !== openid) {
    return { success: false, code: "FORBIDDEN" };
  }

  const categories = await getAllByWardrobe("wardrobe_categories", wardrobeId);
  const items = await getAllByWardrobe("wardrobe_items", wardrobeId);
  const fileResult = await deleteCloudFiles(collectItemFileIds(items));

  await removeDocs("wardrobe_categories", categories.map(item => item._id));
  await removeDocs("wardrobe_items", items.map(item => item._id));
  await db.collection("wardrobe_hubs").doc(wardrobeId).remove();

  return {
    success: true,
    deleted: {
      wardrobe: 1,
      categories: categories.length,
      items: items.length,
      files: fileResult
    }
  };
};

const registerUser = async (event) => {
  await ensureCollection("wardrobe_users");

  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const userInfo = event.userInfo || {};
  const userData = {
    openid,
    nickName: userInfo.nickName || "衣柜用户",
    avatarUrl: userInfo.avatarUrl || "",
    lastLoginAt: db.serverDate()
  };

  const existed = await db.collection("wardrobe_users")
    .where({ openid })
    .limit(1)
    .get();

  if (existed.data && existed.data.length > 0) {
    const doc = existed.data[0];
    await db.collection("wardrobe_users").doc(doc._id).update({
      data: userData
    });
    return {
      success: true,
      user: {
        userId: doc._id,
        openid,
        nickName: userData.nickName,
        avatarUrl: userData.avatarUrl,
        registeredAt: doc.registeredAt || Date.now()
      }
    };
  }

  const addRes = await db.collection("wardrobe_users").add({
    data: {
      ...userData,
      registeredAt: db.serverDate()
    }
  });

  return {
    success: true,
    user: {
      userId: addRes._id,
      openid,
      nickName: userData.nickName,
      avatarUrl: userData.avatarUrl,
      registeredAt: Date.now()
    }
  };
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数

function getCloudErrorMessage(err) {
  if (!err) return "";
  return err.errMsg || err.message || String(err);
}

async function getAdminAllWardrobes(event) {
  const data = event.data || {};
  const pass = data.password || event.password || "";
  if (pass !== ADMIN_PASSWORD) {
    return { success: false, code: "UNAUTHORIZED_ADMIN" };
  }

  // 1. Fetch users for owner name display.
  let users = [];
  let userFetchMessage = "";
  try {
    const userRes = await db.collection("wardrobe_users").limit(1000).get();
    users = userRes.data || [];
  } catch (err) {
    console.error("fetch admin users error", err);
    userFetchMessage = getCloudErrorMessage(err);
  }

  const userMap = {};
  users.forEach(u => {
    if (u.openid) {
      userMap[u.openid] = u.nickName || "衣柜用户";
    }
  });

  // 2. Fetch all wardrobe hubs. This is the required part of the admin console.
  let wardrobes = [];
  try {
    const hubsRes = await db.collection("wardrobe_hubs").orderBy("createTime", "desc").limit(1000).get();
    wardrobes = hubsRes.data || [];
  } catch (err) {
    console.error("fetch admin wardrobes error", err);
    return {
      success: false,
      code: "FETCH_ADMIN_WARDROBES_FAILED",
      message: getCloudErrorMessage(err)
    };
  }

  const result = wardrobes.map(w => {
    const ownerOpenId = w.ownerOpenId || w.ownerOpenid || "";
    const ownerName = userMap[ownerOpenId] || w.ownerNickName || "衣柜用户";
    return {
      _id: w._id,
      name: w.name || "未命名衣柜",
      desc: w.desc || "",
      icon: w.icon || "衣",
      ownerOpenId,
      ownerName,
      createTime: w.createTime || "",
      shareCode: w.shareCode || "",
      sharedCount: (w.sharedOpenIds || []).length
    };
  });

  return {
    success: true,
    wardrobes: result,
    warningCode: userFetchMessage ? "FETCH_ADMIN_USERS_FAILED" : "",
    warningMessage: userFetchMessage
  };
}
exports.main = async (event, context) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
    case "registerUser":
      return await registerUser(event);

    case "getAdminAllWardrobes":
      return await getAdminAllWardrobes(event);
    case "getWardrobeSnapshot":
      return await getWardrobeSnapshot(event);
    case "getWardrobeItemsPage":
      return await getWardrobeItemsPage(event);
    case "deleteWardrobe":
      return await deleteWardrobe(event);
    case "createItem":
      return await createItem(event);
    case "updateItem":
      return await updateItem(event);
    case "deleteItem":
      return await deleteItem(event);
    case "updateItemStatus":
      return await updateItemStatus(event);
    case "saveSelectedItems":
      return await saveSelectedItems(event);
    case "setItemSelection":
      return await setItemSelection(event);
    case "saveItemOrder":
      return await saveItemOrder(event);
    default:
      return {
        success: false,
        code: "UNKNOWN_FUNCTION_TYPE",
        type: event.type || ""
      };
  }
};
