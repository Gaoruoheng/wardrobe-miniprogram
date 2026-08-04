async function call(type, data) {
  const response = await wx.cloud.callFunction({
    name: "quickstartFunctions",
    data: { type, ...(data || {}) }
  });
  const result = response.result || {};
  if (!result.success) {
    const error = new Error(result.code || "OUTFIT_REQUEST_FAILED");
    error.code = result.code || "OUTFIT_REQUEST_FAILED";
    throw error;
  }
  return result;
}

function listOutfits(params) {
  return call("listOutfits", params);
}

function getOutfit(params) {
  return call("getOutfit", params);
}

function saveOutfit(params) {
  return call("saveOutfit", params);
}

function deleteOutfit(params) {
  return call("deleteOutfit", params);
}

function applyOutfit(params) {
  return call("applyOutfit", params);
}

module.exports = {
  listOutfits,
  getOutfit,
  saveOutfit,
  deleteOutfit,
  applyOutfit
};
