const wardrobeIndexApi = require("../services/wardrobeIndexApi.js");

function togglePlanInput(page) {
  page.setData({ showPlanInput: !page.data.showPlanInput });
}

function onPlanInput(page, e) {
  page.setData({ newPlanText: e.detail.value });
}

function addPlan(page) {
  const text = page.data.newPlanText.trim();
  if (!text) return;
  const plans = page.data.plans.concat([{ text, done: false, id: Date.now() }]);
  page.setData({ plans, newPlanText: "", showPlanInput: false });
  saveMeta(page, { plans });
}

function togglePlanDone(page, e) {
  const index = Number(e.currentTarget.dataset.index);
  const plans = page.data.plans.map((plan, planIndex) =>
    planIndex === index ? { ...plan, done: !plan.done } : plan
  );
  page.setData({ plans });
  saveMeta(page, { plans });
}

function deletePlan(page, e) {
  const index = Number(e.currentTarget.dataset.index);
  const plans = page.data.plans.filter((_, planIndex) => planIndex !== index);
  page.setData({ plans });
  saveMeta(page, { plans });
}

async function saveMeta(page, data) {
  if (!page.data.wardrobeId) return;
  page.cacheCurrentWardrobeState(data);
  try {
    await wardrobeIndexApi.saveMeta(page.data.wardrobeId, data);
  } catch (err) {
    console.error(err);
  }
}

module.exports = {
  togglePlanInput,
  onPlanInput,
  addPlan,
  togglePlanDone,
  deletePlan,
  saveMeta
};
