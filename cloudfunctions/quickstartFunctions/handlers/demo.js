const { cloud, db } = require("../shared/cloud.js");

const getMiniProgramCode = async () => {
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

const createCollection = async () => {
  try {
    await db.createCollection("sales");
    await db.collection("sales").add({ data: { region: "华东", city: "上海", sales: 11 } });
    await db.collection("sales").add({ data: { region: "华东", city: "南京", sales: 11 } });
    await db.collection("sales").add({ data: { region: "华南", city: "广州", sales: 22 } });
    await db.collection("sales").add({ data: { region: "华南", city: "深圳", sales: 22 } });
    return { success: true };
  } catch (e) {
    return {
      success: true,
      data: "create collection success",
    };
  }
};

const selectRecord = async () => {
  return await db.collection("sales").get();
};

const updateRecord = async (event) => {
  try {
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({ _id: event.data[i]._id })
        .update({ data: { sales: event.data[i].sales } });
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

const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
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

const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({ _id: event.data._id })
      .remove();
    return { success: true };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

module.exports = {
  getMiniProgramCode,
  createCollection,
  selectRecord,
  updateRecord,
  insertRecord,
  deleteRecord
};
