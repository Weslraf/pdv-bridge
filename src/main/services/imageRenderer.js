// Renderiza o HTML do cupom em uma janela offscreen do Chromium e converte a
// imagem para comandos ESC/POS de raster (GS v 0). Esse e o caminho "modo
// imagem": o que sai no papel e identico ao que o navegador desenha, sem
// depender de codepage da impressora (acentos e simbolos sempre corretos).

const { BrowserWindow } = require("electron");
const { dotsFor } = require("./htmlBuilder");

const ESC = 0x1b;
const GS = 0x1d;
const INIT = Buffer.from([ESC, 0x40]);
const CUT_FULL = Buffer.from([GS, 0x56, 0x00]);
const CUT_PARTIAL = Buffer.from([GS, 0x56, 0x01]);
const FEED = Buffer.from([0x0a, 0x0a, 0x0a]);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let renderWin = null;
function getWindow() {
  if (renderWin && !renderWin.isDestroyed()) return renderWin;
  renderWin = new BrowserWindow({
    show: false,
    width: 600,
    height: 800,
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  renderWin.webContents.setFrameRate(60);
  return renderWin;
}

async function captureHtml(html, width) {
  const win = getWindow();
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  await delay(60);

  const height = await win.webContents.executeJavaScript(
    "Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))"
  );
  win.setContentSize(width, Math.max(1, height));

  // Aguarda um paint (offscreen) com timeout de seguranca.
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    win.webContents.once("paint", finish);
    win.webContents.invalidate();
    setTimeout(finish, 350);
  });
  await delay(40);

  let image = await win.webContents.capturePage();
  if (image.getSize().width !== width) {
    image = image.resize({ width });
  }
  return image;
}

/** Converte a imagem (BGRA) em bandas de raster GS v 0 (1 bit por pixel). */
function imageToRaster(image, threshold) {
  const { width, height } = image.getSize();
  const bgra = image.toBitmap(); // BGRA, top-down
  const bytesPerRow = Math.ceil(width / 8);
  const BAND = 128; // limita a altura por comando p/ compatibilidade
  const parts = [];

  for (let y0 = 0; y0 < height; y0 += BAND) {
    const rows = Math.min(BAND, height - y0);
    const data = Buffer.alloc(bytesPerRow * rows, 0);

    for (let y = 0; y < rows; y++) {
      const sy = y0 + y;
      const rowBase = sy * width * 4;
      const outBase = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        const i = rowBase + x * 4;
        const b = bgra[i];
        const g = bgra[i + 1];
        const r = bgra[i + 2];
        const a = bgra[i + 3] / 255;
        // luminancia composta sobre fundo branco
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
        if (lum < threshold) {
          data[outBase + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }

    parts.push(
      Buffer.from([
        GS, 0x76, 0x30, 0x00,
        bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
        rows & 0xff, (rows >> 8) & 0xff
      ])
    );
    parts.push(data);
  }

  return Buffer.concat(parts);
}

/**
 * Monta o documento ESC/POS completo em modo imagem.
 * @param {object} payload payload do /print (html | blocks | text, paperWidth, cut, drawer)
 * @param {string} html HTML ja montado (buildReceiptHtml)
 */
async function buildImageDocument(payload, html) {
  const width = dotsFor(payload.paperWidth || 80);
  const image = await captureHtml(html, width);
  const raster = imageToRaster(image, Number(payload.threshold) || 170);

  const parts = [INIT, raster, FEED];
  if (payload.drawer) parts.push(Buffer.from([ESC, 0x70, 0, 25, 250]));
  if (payload.cut !== false) {
    parts.push(payload.cutMode === "partial" ? CUT_PARTIAL : CUT_FULL);
  }
  return Buffer.concat(parts);
}

module.exports = { buildImageDocument, captureHtml };
