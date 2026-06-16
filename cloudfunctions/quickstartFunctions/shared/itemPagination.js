function normalizeItemCursor(cursor) {
  if (!cursor || typeof cursor !== "object") return null;
  const sortOrder = Number(cursor.sortOrder);
  const id = typeof cursor.id === "string" ? cursor.id.trim() : "";
  if (!Number.isFinite(sortOrder) || !id) return null;
  return { sortOrder, id };
}

function createItemCursor(item) {
  if (!item || !item._id || !Number.isFinite(Number(item.sort_order))) return null;
  return {
    sortOrder: Number(item.sort_order),
    id: item._id
  };
}

function toItemPageResult(fetchedItems, limit) {
  const safeLimit = Math.max(1, Number(limit) || 20);
  const items = (fetchedItems || []).slice(0, safeLimit);
  const hasMore = (fetchedItems || []).length > safeLimit;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? createItemCursor(items[items.length - 1]) : null
  };
}

function buildItemCursorWhere(dbCommand, wardrobeId, cursor) {
  const normalizedCursor = normalizeItemCursor(cursor);
  if (!normalizedCursor) return { wardrobeId };
  return dbCommand.and([
    { wardrobeId },
    dbCommand.or([
      { sort_order: dbCommand.gt(normalizedCursor.sortOrder) },
      dbCommand.and([
        { sort_order: normalizedCursor.sortOrder },
        { _id: dbCommand.gt(normalizedCursor.id) }
      ])
    ])
  ]);
}

function buildCategoryItemCursorWhere(dbCommand, wardrobeId, category, cursor) {
  const base = { wardrobeId, category };
  const normalizedCursor = normalizeItemCursor(cursor);
  if (!normalizedCursor) return base;
  return dbCommand.and([
    base,
    dbCommand.or([
      { sort_order: dbCommand.gt(normalizedCursor.sortOrder) },
      dbCommand.and([
        { sort_order: normalizedCursor.sortOrder },
        { _id: dbCommand.gt(normalizedCursor.id) }
      ])
    ])
  ]);
}

function buildIdCursorWhere(dbCommand, wardrobeId, cursorId) {
  const id = typeof cursorId === "string" ? cursorId.trim() : "";
  if (!id) return { wardrobeId };
  return dbCommand.and([
    { wardrobeId },
    { _id: dbCommand.gt(id) }
  ]);
}

module.exports = {
  normalizeItemCursor,
  createItemCursor,
  toItemPageResult,
  buildItemCursorWhere,
  buildCategoryItemCursorWhere,
  buildIdCursorWhere
};
