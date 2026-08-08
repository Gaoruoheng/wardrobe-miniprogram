function normalizeItems(items, source, usedIds) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const sourceItem = item || {};
    const baseId = sourceItem.id === undefined || sourceItem.id === null
      ? `${source}-${index}`
      : sourceItem.id;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(String(id))) {
      id = `${String(baseId)}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(String(id));
    return {
      id,
      text: typeof sourceItem.text === "string" ? sourceItem.text : String(sourceItem.text || ""),
      done: !!sourceItem.done
    };
  });
}

function mergeLegacyPlans(plans, tasks) {
  const usedIds = new Set();
  const legacyTasks = Array.isArray(tasks) ? tasks : [];
  return {
    plans: normalizeItems(plans, "plan", usedIds)
      .concat(normalizeItems(legacyTasks, "task", usedIds)),
    migrated: legacyTasks.length > 0
  };
}

module.exports = {
  mergeLegacyPlans
};
