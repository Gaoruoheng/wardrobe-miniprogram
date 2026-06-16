const { cloud, db } = require("../shared/cloud.js");
const {
  DELETE_DOC_BATCH_SIZE,
  STATUS_AVAILABLE,
  STATUS_IN_USE,
  DEFAULT_ITEM_NAME,
  DEFAULT_ITEM_IMAGE
} = require("../shared/constants.js");
const {
  chunkList,
  normalizeText,
  normalizeItemStatus,
  uniqueIds,
  updateWardrobeUpdatedAt
} = require("../shared/core.js");
const { collectItemFileIds, collectUnusedItemFiles, deleteCloudFiles } = require("../shared/files.js");
const { getWardrobeForUser, getItemForUser } = require("../shared/access.js");
const {
  ensureCategory,
  getCategoryItemCount,
  adjustCategoryItemCount
} = require("../shared/categories.js");

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

module.exports = {
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  saveSelectedItems,
  setItemSelection,
  saveItemOrder
};
