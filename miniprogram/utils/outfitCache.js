const { getCache, setCache, removeCache } = require("./pageCache.js");

const CACHE_SCOPE = "wardrobe-outfits";
const MAX_CACHE_AGE = 1000 * 60 * 30;

function cacheId(user, wardrobeId) {
  const openid = user && user.openid || "";
  return [openid, wardrobeId || ""].join(":");
}

function getOutfitCache(user, wardrobeId) {
  const cached = getCache(CACHE_SCOPE, cacheId(user, wardrobeId), {
    maxAge: MAX_CACHE_AGE
  });
  return cached ? cached.outfits || [] : null;
}

function setOutfitCache(user, wardrobeId, outfits) {
  setCache(CACHE_SCOPE, cacheId(user, wardrobeId), {
    outfits: Array.isArray(outfits) ? outfits : []
  });
}

function removeOutfitCache(user, wardrobeId) {
  removeCache(CACHE_SCOPE, cacheId(user, wardrobeId));
}

module.exports = {
  getOutfitCache,
  setOutfitCache,
  removeOutfitCache
};
