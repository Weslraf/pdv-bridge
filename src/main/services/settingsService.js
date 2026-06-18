const ElectronStore = require("electron-store");
const Store = ElectronStore.default || ElectronStore;

let store;
try {
  store = new Store({
    name: "pdv-bridge-settings",
    projectName: "pdv-bridge",
    defaults: {
      selectedPrinterName: "",
      startWithWindows: true,
      paperWidth: 80,
      encoding: "cp860"
    }
  });
} catch (e) {
  // fallback simples se electron-store falhar
  const data = {
    selectedPrinterName: "",
    startWithWindows: true,
    paperWidth: 80,
    encoding: "cp860"
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
function getPaperWidth() {
  return Number(store.get("paperWidth")) || 80;
}
function setPaperWidth(width) {
  const w = Number(width) === 58 ? 58 : 80;
  store.set("paperWidth", w);
}
function getEncoding() {
  return store.get("encoding") || "cp860";
}
function setEncoding(encoding) {
  store.set("encoding", String(encoding || "cp860"));
}

module.exports = {
  getSelectedPrinterName,
  setSelectedPrinterName,
  getStartWithWindows,
  setStartWithWindows,
  getPaperWidth,
  setPaperWidth,
  getEncoding,
  setEncoding
};