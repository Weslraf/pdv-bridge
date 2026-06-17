const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bridgeApi", {
  getPrinters: () => ipcRenderer.invoke("printers:list"),
  getSelectedPrinter: () => ipcRenderer.invoke("printer:selected:get"),
  setSelectedPrinter: (printerName) =>
    ipcRenderer.invoke("printer:selected:set", printerName),
  getStartWithWindows: () => ipcRenderer.invoke("startup:get"),
  setStartWithWindows: (enabled) => ipcRenderer.invoke("startup:set", enabled),
  getAppInfo: () => ipcRenderer.invoke("app:getInfo"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  copyText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  printTest: () => ipcRenderer.invoke("print:test"),
  onServerLog: (handler) =>
    ipcRenderer.on("server:log", (_, message) => handler(message)),

  // Histórico de impressões
  getHistory: () => ipcRenderer.invoke("history:list"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  onHistoryAdded: (handler) =>
    ipcRenderer.on("history:added", (_, entry) => handler(entry)),

  // Controles da janela flutuante
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  hideWindow: () => ipcRenderer.invoke("window:hide"),
  setPinned: (pinned) => ipcRenderer.invoke("window:pin", pinned)
});
