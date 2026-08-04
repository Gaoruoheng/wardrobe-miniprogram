Component({
  properties: {
    show: { type: Boolean, value: false },
    saving: { type: Boolean, value: false },
    itemCount: { type: Number, value: 0 }
  },
  data: { name: "", note: "" },
  observers: {
    show(value) {
      if (value) this.setData({ name: "", note: "" });
    }
  },
  methods: {
    noop() {},
    closePanel() { if (!this.data.saving) this.triggerEvent("close"); },
    onNameInput(event) { this.setData({ name: event.detail.value }); },
    onNoteInput(event) { this.setData({ note: event.detail.value }); },
    confirmSave() {
      if (this.data.saving) return;
      const name = (this.data.name || "").trim();
      if (!name) {
        wx.showToast({ title: "请先填写套装名称", icon: "none" });
        return;
      }
      this.triggerEvent("confirm", { name, note: (this.data.note || "").trim() });
    }
  }
});
