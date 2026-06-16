const { getOpenId, registerUser } = require("./handlers/auth.js");
const {
  getMiniProgramCode,
  createCollection,
  selectRecord,
  updateRecord,
  insertRecord,
  deleteRecord
} = require("./handlers/demo.js");
const { getAdminAllWardrobes } = require("./handlers/admin.js");
const {
  getWardrobeSnapshot,
  getWardrobeItemsPage,
  deleteWardrobe
} = require("./handlers/wardrobe.js");
const {
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  saveSelectedItems,
  setItemSelection,
  saveItemOrder
} = require("./handlers/item.js");

const handlers = {
  getOpenId,
  getMiniProgramCode,
  createCollection,
  selectRecord,
  updateRecord,
  insertRecord,
  deleteRecord,
  registerUser,
  getAdminAllWardrobes,
  getWardrobeSnapshot,
  getWardrobeItemsPage,
  deleteWardrobe,
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  saveSelectedItems,
  setItemSelection,
  saveItemOrder
};

exports.main = async (event = {}) => {
  const handler = handlers[event.type];
  if (!handler) {
    return {
      success: false,
      code: "UNKNOWN_FUNCTION_TYPE",
      type: event.type || ""
    };
  }
  return await handler(event);
};
