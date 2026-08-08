Component({
  properties: {
    skin: { type: String, value: "" },
    outfits: { type: Array, value: [] },
    loading: { type: Boolean, value: false },
    error: { type: Boolean, value: false }
  },
  methods: {
    createOutfit() { this.triggerEvent("create"); },
    openOutfit(event) {
      this.triggerEvent("open", { id: event.currentTarget.dataset.id });
    },
    retry() { this.triggerEvent("retry"); }
  }
});
