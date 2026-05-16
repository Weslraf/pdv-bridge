const path = require("path");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
  clipboard
} = require("electron");
const {
  APP_NAME,
  APP_VERSION,
  APP_USER_MODEL_ID,
  APP_ICON,
  PRELOAD_PATH,
  RENDERER_PATH,
  SERVER_PORT
} = require("./config");
const { createHttpServer } = require("./server/httpServer");
const { createSocketGateway } = require("./websocket/socketGateway");
const { printEscPos } = require("./services/printerService");
const {
  getSelectedPrinterName,
  setSelectedPrinterName,
  getStartWithWindows,
  setStartWithWindows
} = require("./services/settingsService");

let mainWindow = null;
let appTray = null;
let httpServer = null;
const socketGateway = createSocketGateway();

app.setAppUserModelId(APP_USER_MODEL_ID);

async function getInstalledPrinters() {
  if (!mainWindow) return [];
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    isDefault: printer.isDefault
  }));
}

function sendLogToRenderer(message) {
  if (!mainWindow) return;
  mainWindow.webContents.send("server:log", message);
}

function applyStartupSetting(enabled) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 680,
    minWidth: 360,
    minHeight: 520,
    show: true,
    title: APP_NAME,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(RENDERER_PATH);

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(APP_ICON);
  appTray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir PDV Bridge",
      click: () => mainWindow?.show()
    },
    {
      label: "Abrir /health no navegador",
      click: () => {
        shell.openExternal(`http://localhost:${SERVER_PORT}/health`).catch(
          () => {}
        );
      }
    },
    {
      type: "separator"
    },
    {
      label: "Sair",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  appTray.setToolTip(APP_NAME);
  appTray.setContextMenu(contextMenu);
  appTray.on("double-click", () => mainWindow?.show());
}

function setupIpc() {
  ipcMain.handle("printers:list", () => getInstalledPrinters());
  ipcMain.handle("printer:selected:get", () => getSelectedPrinterName());
  ipcMain.handle("printer:selected:set", (_event, printerName) => {
    setSelectedPrinterName(printerName || "");
    return { ok: true };
  });
  ipcMain.handle("startup:get", () => getStartWithWindows());
  ipcMain.handle("startup:set", (_event, enabled) => {
    setStartWithWindows(enabled);
    applyStartupSetting(enabled);
    return { ok: true };
  });
  ipcMain.handle("app:getInfo", () => ({
    name: APP_NAME,
    version: APP_VERSION,
    port: SERVER_PORT,
    baseUrl: `http://localhost:${SERVER_PORT}`
  }));
  ipcMain.handle("shell:openExternal", (_event, url) => {
    if (typeof url !== "string") {
      return { ok: false, error: "URL invalida." };
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "URL invalida." };
    }
    const host = parsed.hostname;
    const loopback =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1";
    if (!loopback || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      return { ok: false, error: "So URLs de loopback sao permitidas." };
    }
    return shell.openExternal(url).then(
      () => ({ ok: true }),
      (e) => ({ ok: false, error: e.message })
    );
  });
  ipcMain.handle("clipboard:writeText", (_event, text) => {
    clipboard.writeText(String(text ?? ""));
    return { ok: true };
  });
  ipcMain.handle("print:test", async () => {
    const name = getSelectedPrinterName();
    if (!name) {
      return { ok: false, error: "Selecione e salve uma impressora primeiro." };
    }
    try {
      await printEscPos(name, {
        text: [
          "PDV Bridge",
          "Teste de impressao",
          new Date().toLocaleString("pt-BR"),
          "----------------",
          "OK"
        ],
        cut: true
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

async function bootstrap() {
  createMainWindow();
  createTray();
  setupIpc();
  socketGateway.init();

  applyStartupSetting(getStartWithWindows());

  httpServer = await createHttpServer({
    getPrinters: getInstalledPrinters,
    onPrintRequest: (payload) => {
      socketGateway.publish("print:requested", payload);
      sendLogToRenderer("Requisicao /print processada com sucesso.");
    }
  });

  sendLogToRenderer(
    "API pronta. Dica: no site use fetch com targetAddressSpace: \"loopback\"."
  );
}

app.whenReady().then(() => bootstrap().catch(console.error));

app.on("window-all-closed", () => {
  // Manter app ativo no tray no Windows.
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (httpServer) {
    httpServer.close();
  }
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createMainWindow();
  }
});
