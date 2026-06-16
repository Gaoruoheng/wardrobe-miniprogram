function normalizeText(value) {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function keywordTokens(keyword) {
  return normalizeText(keyword).split(" ").filter(token => !!token);
}

function fuzzyMatch(source, keyword) {
  const text = compactText(source);
  const query = compactText(keyword);
  if (!query) return true;
  if (text.indexOf(query) >= 0) return true;

  let cursor = 0;
  for (let index = 0; index < query.length; index += 1) {
    cursor = text.indexOf(query[index], cursor);
    if (cursor < 0) return false;
    cursor += 1;
  }
  return true;
}

function itemMatchesKeyword(item, keyword) {
  const tokens = keywordTokens(keyword);
  if (tokens.length === 0) return true;

  const fields = [
    item.name,
    item.color,
    item.notes
  ];

  return tokens.every(token =>
    fields.some(field => fuzzyMatch(field, token))
  );
}

function categoryMatchesKeyword(categoryName, keyword) {
  const category = compactText(categoryName);
  const query = compactText(keyword);
  if (!category || !query) return false;
  if (category === query || category.indexOf(query) >= 0 || query.indexOf(category) >= 0) {
    return true;
  }

  const tokens = keywordTokens(keyword);
  return tokens.length > 0 && tokens.every(token => fuzzyMatch(categoryName, token));
}

function findMatchingCategoryIndex(cats, keyword) {
  const query = compactText(keyword);
  if (!query) return -1;

  let fuzzyIndex = -1;
  for (let index = 0; index < cats.length; index += 1) {
    const cat = cats[index];
    const category = compactText(cat);
    if (!category) continue;
    if (category === query || category.indexOf(query) >= 0 || query.indexOf(category) >= 0) {
      return index;
    }
    if (fuzzyIndex < 0 && categoryMatchesKeyword(cat, keyword)) {
      fuzzyIndex = index;
    }
  }
  return fuzzyIndex;
}

module.exports = {
  normalizeText,
  itemMatchesKeyword,
  findMatchingCategoryIndex
};
