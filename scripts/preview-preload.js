// Mock do bridgeApi só para pré-visualizar a UI offscreen (não vai no build).
const { contextBridge } = require("electron");

const sampleHistory = [
  { id: "1", time: new Date().toISOString(), source: "http", title: "ADEGA DA SKINA", preview: [], lineCount: 14, printerName: "Bematech MP-4200 HS", status: "ok", error: "" },
  { id: "2", time: new Date(Date.now() - 120000).toISOString(), source: "http", title: "Pedido #1632 - 2x Heineken 600ml", preview: [], lineCount: 11, printerName: "Bematech MP-4200 HS", status: "ok", error: "" },
  { id: "3", time: new Date(Date.now() - 300000).toISOString(), source: "test", title: "Uno Print", preview: [], lineCount: 5, printerName: "Bematech MP-4200 HS", status: "ok", error: "" },
  { id: "4", time: new Date(Date.now() - 600000).toISOString(), source: "http", title: "Pedido #1629", preview: [], lineCount: 9, printerName: "Bematech MP-4200 HS", status: "error", error: "OpenPrinter falhou (codigo 1801). Verifique o nome da impressora." }
];

contextBridge.exposeInMainWorld("bridgeApi", {
  getPrinters: async () => [
    { name: "Bematech MP-4200 HS", isDefault: true },
    { name: "Microsoft Print to PDF", isDefault: false }
  ],
  getSelectedPrinter: async () => "Bematech MP-4200 HS",
  setSelectedPrinter: async () => ({ ok: true }),
  getStartWithWindows: async () => true,
  setStartWithWindows: async () => ({ ok: true }),
  getAppInfo: async () => ({ name: "Uno Print", version: "0.2.0", port: 8181, baseUrl: "http://localhost:8181" }),
  openExternal: async () => ({ ok: true }),
  copyText: async () => ({ ok: true }),
  printTest: async () => ({ ok: true }),
  onServerLog: () => {},
  getHistory: async () => ({ entries: sampleHistory, stats: { total: 4, ok: 3, error: 1 } }),
  clearHistory: async () => ({ ok: true }),
  onHistoryAdded: () => {},
  minimizeWindow: async () => ({ ok: true }),
  hideWindow: async () => ({ ok: true }),
  setPinned: async (p) => ({ ok: true, pinned: p })
});
