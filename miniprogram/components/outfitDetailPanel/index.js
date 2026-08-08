Component({
  properties: {
    skin: { type: String, value: "" },
    show: { type: Boolean, value: false },
    outfit: { type: Object, value: null },
    applying: { type: Boolean, value: false }
  },
  methods: {
    noop() {},
    closePanel() { this.triggerEvent("close"); },
    applyOutfit() { if (!this.data.applying) this.triggerEvent("apply"); },
    editOutfit() { this.triggerEvent("edit"); },
    deleteOutfit() { this.triggerEvent("delete"); }
  }
});
