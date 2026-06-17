// Renderiza a UI real offscreen e salva dist/ui-preview.png (não vai no build).
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 360,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "preview-preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(root, "src", "renderer", "index.html"));
  await new Promise((r) => setTimeout(r, 900));

  const image = await win.capturePage();
  fs.writeFileSync(path.join(root, "dist", "ui-preview.png"), image.toPNG());
  console.log("ui-preview.png gerado:", image.getSize());
  app.quit();
});
