const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

const store = new Store({
  name: "pdv-bridge-settings",
  defaults: {
    selectedPrinterName: "",
    startWithWindows: true
  }
});

function getSelectedPrinterName() {
  return store.get("selectedPrinterName");
}

function setSelectedPrinterName(printerName) {
  store.set("selectedPrinterName", printerName);
}

function getStartWithWindows() {
  return store.get("startWithWindows");
}

function setStartWithWindows(enabled) {
  store.set("startWithWindows", Boolean(enabled));
}

module.exports = {
  getSelectedPrinterName,
  setSelectedPrinterName,
  getStartWithWindows,
  setStartWithWindows
};
