const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

let store;
try {
  store = new Store({
    name: "pdv-bridge-settings",
    projectName: "pdv-bridge",
    defaults: {
      selectedPrinterName: "",
      startWithWindows: true
    }
  });
} catch (e) {
  // fallback simples se electron-store falhar
  const data = {
    selectedPrinterName: "",
    startWithWindows: true
  };
  store = {
    get: (key) => data[key],
    set: (key, val) => { data[key] = val; }
  };
}

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