const { db } = require("./cloud.js");
const {
  PAGE_SIZE,
  DELETE_DOC_BATCH_SIZE,
  STATUS_AVAILABLE,
  STATUS_IN_USE,
  STATUS_STORED
} = require("./constants.js");
const {
  buildIdCursorWhere
} = require("./itemPagination.js");

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

async function getAllByWardrobe(collectionName, wardrobeId) {
  let cursorId = "";
  let result = [];
  const _ = db.command;

  while (true) {
    const res = await db.collection(collectionName)
      .where(buildIdCursorWhere(_, wardrobeId, cursorId))
      .orderBy("_id", "asc")
      .limit(PAGE_SIZE)
      .get();
    const page = res.data || [];
    result = result.concat(page);
    if (page.length < PAGE_SIZE) break;
    cursorId = page[page.length - 1]._id || "";
    if (!cursorId) break;
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

async function updateWardrobeUpdatedAt(wardrobeId, extraData = {}) {
  await db.collection("wardrobe_hubs").doc(wardrobeId).update({
    data: {
      ...extraData,
      updatedAt: db.serverDate()
    }
  });
}

module.exports = {
  chunkList,
  normalizeText,
  normalizeItemStatus,
  uniqueIds,
  getAllByWardrobe,
  removeDocs,
  updateWardrobeUpdatedAt
};
