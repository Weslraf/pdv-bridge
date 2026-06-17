// Rasteriza build/logo.svg para build/icon.png usando o Electron offscreen.
// Uso: electron scripts/make-icon.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const SIZE = 512;
const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "build", "logo.svg"), "utf8");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent;}
  svg{display:block;width:${SIZE}px;height:${SIZE}px;}
</style></head><body>${svg}</body></html>`;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    useContentSize: true,
    webPreferences: { offscreen: false }
  });

  await win.loadURL(
    "data:text/html;charset=utf-8," + encodeURIComponent(html)
  );
  await new Promise((r) => setTimeout(r, 500));

  const image = await win.capturePage();
  fs.writeFileSync(path.join(root, "build", "icon.png"), image.toPNG());

  console.log("icon.png gerado:", image.getSize());
  app.quit();
});
