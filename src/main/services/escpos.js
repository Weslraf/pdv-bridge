// Renderizador ESC/POS: transforma o payload do /print em bytes para a
// impressora termica. Suporta o formato estruturado { blocks: [...] } e
// mantem compatibilidade com o formato antigo { text: string[] }.
//
// Encoding: por padrao CP860 (Portugues) para que acentos saiam corretos
// (CONVENIENCIA, ENDERECO, SAO PAULO). Convertido via iconv-lite + ESC t.

const iconv = require("iconv-lite");

const ESC = 0x1b;
const GS = 0x1d;
const bytes = (...a) => Buffer.from(a);

// codepage -> numero da tabela do comando ESC t n
const CODEPAGE_CMD = { cp437: 0, cp850: 2, cp860: 3, cp852: 18, cp858: 19 };
const QR_EC = { L: 48, M: 49, Q: 50, H: 51 };

const CMD = {
  init: bytes(ESC, 0x40),
  alignLeft: bytes(ESC, 0x61, 0),
  alignCenter: bytes(ESC, 0x61, 1),
  alignRight: bytes(ESC, 0x61, 2),
  boldOn: bytes(ESC, 0x45, 1),
  boldOff: bytes(ESC, 0x45, 0),
  underlineOn: bytes(ESC, 0x2d, 1),
  underlineOff: bytes(ESC, 0x2d, 0),
  sizeReset: bytes(GS, 0x21, 0),
  cutFull: bytes(GS, 0x56, 0),
  cutPartial: bytes(GS, 0x56, 1),
  lf: bytes(0x0a)
};

/** Colunas de caractere conforme a largura do papel (Fonte A). */
function colsForWidth(paperWidth) {
  return Number(paperWidth) === 58 ? 32 : 48;
}

function encodeText(str, codepage) {
  const cp = String(codepage || "cp860").toLowerCase();
  const value = str == null ? "" : String(str);
  if (iconv.encodingExists(cp)) return iconv.encode(value, cp);
  return Buffer.from(value, "latin1");
}

function selectCodepage(codepage) {
  const n = CODEPAGE_CMD[String(codepage || "cp860").toLowerCase()];
  return n == null ? Buffer.alloc(0) : bytes(ESC, 0x74, n);
}

function sizeByte(size) {
  switch (String(size || "normal")) {
    case "large":
    case "double":
      return 0x11; // dobro de largura e altura
    case "wide":
      return 0x10;
    case "tall":
      return 0x01;
    default:
      return 0x00;
  }
}
function isDoubleWidth(size) {
  return (sizeByte(size) & 0xf0) !== 0;
}
function alignCmd(align) {
  if (align === "center") return CMD.alignCenter;
  if (align === "right") return CMD.alignRight;
  return CMD.alignLeft;
}

// ----- QR Code nativo (GS ( k, modelo 2) -----
function buildQrCode(data, opts = {}) {
  const payload = Buffer.from(String(data == null ? "" : data), "latin1");
  const storeLen = payload.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  const size = Math.min(16, Math.max(1, parseInt(opts.size, 10) || 6));
  const ec = QR_EC[String(opts.ec || opts.errorCorrection || "M").toUpperCase()] || QR_EC.M;
  return Buffer.concat([
    bytes(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00),
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size),
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ec),
    bytes(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30),
    payload,
    bytes(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30)
  ]);
}

// ----- Helpers de texto -----
function padRight(s, w) {
  s = String(s);
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}
function padLeft(s, w) {
  s = String(s);
  return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
}
function wrapText(str, width) {
  const w = Math.max(1, width);
  const words = String(str == null ? "" : str).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  for (const word of words) {
    if (word.length > w) {
      if (cur) { lines.push(cur); cur = ""; }
      let rest = word;
      while (rest.length > w) { lines.push(rest.slice(0, w)); rest = rest.slice(w); }
      cur = rest;
    } else if ((cur ? cur.length + 1 : 0) + word.length <= w) {
      cur = cur ? cur + " " + word : word;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ----- Renderizadores de bloco -----
function renderText(block, ctx) {
  const parts = [alignCmd(block.align)];
  if (block.bold) parts.push(CMD.boldOn);
  if (block.underline) parts.push(CMD.underlineOn);
  const sz = sizeByte(block.size);
  if (sz) parts.push(bytes(GS, 0x21, sz));

  const width = isDoubleWidth(block.size) ? Math.floor(ctx.cols / 2) : ctx.cols;
  const lines = String(block.value == null ? "" : block.value)
    .split("\n")
    .flatMap((l) => wrapText(l, width));
  for (const ln of lines) {
    parts.push(encodeText(ln, ctx.codepage), CMD.lf);
  }

  if (sz) parts.push(CMD.sizeReset);
  if (block.underline) parts.push(CMD.underlineOff);
  if (block.bold) parts.push(CMD.boldOff);
  parts.push(CMD.alignLeft);
  return Buffer.concat(parts);
}

function renderDivider(block, ctx) {
  const style = String(block.style || "solid");
  if (block.char) {
    const line = String(block.char).repeat(ctx.cols).slice(0, ctx.cols);
    return Buffer.concat([CMD.alignLeft, encodeText(line, ctx.codepage), CMD.lf]);
  }
  if (style === "dashed") {
    return Buffer.concat([CMD.alignLeft, encodeText("-".repeat(ctx.cols), ctx.codepage), CMD.lf]);
  }
  if (style === "dotted") {
    return Buffer.concat([CMD.alignLeft, encodeText(".".repeat(ctx.cols), ctx.codepage), CMD.lf]);
  }
  // solid: usa o byte de linha continua (0xC4) presente no CP437/850/860
  return Buffer.concat([CMD.alignLeft, Buffer.from(new Array(ctx.cols).fill(0xc4)), CMD.lf]);
}

function renderKv(block, ctx) {
  const dbl = isDoubleWidth(block.size);
  const width = dbl ? Math.floor(ctx.cols / 2) : ctx.cols;
  let left = String(block.left == null ? "" : block.left);
  const right = String(block.right == null ? "" : block.right);
  let space = width - left.length - right.length;
  if (space < 1) {
    left = left.slice(0, Math.max(0, width - right.length - 1));
    space = Math.max(1, width - left.length - right.length);
  }
  const line = left + " ".repeat(space) + right;

  const parts = [CMD.alignLeft];
  if (block.bold) parts.push(CMD.boldOn);
  const sz = sizeByte(block.size);
  if (sz) parts.push(bytes(GS, 0x21, sz));
  parts.push(encodeText(line, ctx.codepage), CMD.lf);
  if (sz) parts.push(CMD.sizeReset);
  if (block.bold) parts.push(CMD.boldOff);
  return Buffer.concat(parts);
}

function renderTable(block, ctx) {
  const header = (block.header || []).map((h) => String(h == null ? "" : h));
  const rows = (block.rows || []).map((r) => r.map((c) => String(c == null ? "" : c)));
  const cols = header.length || (rows[0] ? rows[0].length : 0);
  if (!cols) return Buffer.alloc(0);

  const totalW = ctx.cols;
  const gaps = cols - 1;

  const nat = [];
  for (let i = 0; i < cols; i++) {
    let m = header[i] ? header[i].length : 0;
    for (const r of rows) m = Math.max(m, (r[i] || "").length);
    nat[i] = m;
  }

  let widths;
  if (Array.isArray(block.widths) && block.widths.length === cols) {
    widths = block.widths.slice();
  } else {
    const sumNat = nat.reduce((a, b) => a + b, 0);
    const flex = nat.indexOf(Math.max(...nat)); // coluna mais larga = texto
    widths = nat.slice();
    if (sumNat + gaps <= totalW) {
      widths[flex] += totalW - gaps - sumNat;
    } else {
      const others = sumNat - nat[flex];
      widths[flex] = Math.max(6, totalW - gaps - others);
      let over = widths.reduce((a, b) => a + b, 0) + gaps - totalW;
      let guard = 0;
      while (over > 0 && guard++ < 2000) {
        const idx = widths.indexOf(Math.max(...widths));
        if (widths[idx] <= 3) break;
        widths[idx]--;
        over--;
      }
    }
  }

  // Alinha a direita colunas numericas (qtd, valores).
  const rightCol = [];
  for (let i = 0; i < cols; i++) {
    const cells = rows.map((r) => r[i] || "");
    rightCol[i] = cells.length > 0 && cells.every((c) => c === "" || /^[\d.,()R$%\-\s]+$/.test(c));
  }

  const renderRow = (cells, bold) => {
    const wrapped = cells.map((c, i) =>
      rightCol[i] ? [String(c).slice(0, widths[i])] : wrapText(c, widths[i])
    );
    const height = Math.max(...wrapped.map((a) => a.length));
    const buf = [CMD.alignLeft];
    if (bold) buf.push(CMD.boldOn);
    for (let li = 0; li < height; li++) {
      const segs = [];
      for (let i = 0; i < cols; i++) {
        const seg = wrapped[i][li] || "";
        segs.push(rightCol[i] ? padLeft(seg, widths[i]) : padRight(seg, widths[i]));
      }
      buf.push(encodeText(segs.join(" "), ctx.codepage), CMD.lf);
    }
    if (bold) buf.push(CMD.boldOff);
    return Buffer.concat(buf);
  };

  const out = [];
  if (header.some((h) => h)) out.push(renderRow(header, true));
  for (const r of rows) out.push(renderRow(r, false));
  return Buffer.concat(out);
}

function renderQr(block, ctx) {
  return Buffer.concat([
    alignCmd(block.align || "center"),
    buildQrCode(block.data, { size: block.size, ec: block.errorCorrection || block.ec }),
    CMD.lf,
    CMD.alignLeft
  ]);
}

function renderBlock(block, ctx) {
  if (!block || typeof block !== "object") return Buffer.alloc(0);
  switch (String(block.type)) {
    case "text":
      return renderText(block, ctx);
    case "divider":
      return renderDivider(block, ctx);
    case "kv":
      return renderKv(block, ctx);
    case "table":
      return renderTable(block, ctx);
    case "qr":
      return renderQr(block, ctx);
    case "feed":
      return Buffer.from(new Array(Math.max(1, Math.min(20, block.lines || 1))).fill(0x0a));
    case "cut":
      return block.mode === "partial" ? CMD.cutPartial : CMD.cutFull;
    case "drawer":
      return bytes(ESC, 0x70, 0, 25, 250);
    default:
      // Bloco desconhecido: se tiver texto, imprime como texto p/ nao perder info.
      if (block.value != null) return renderText({ ...block, type: "text" }, ctx);
      return Buffer.alloc(0);
  }
}

// Compatibilidade: { text: string[] } + token {{qr:...}} + campo qrcode.
function renderLegacyText(payload, ctx) {
  const text = Array.isArray(payload.text) ? payload.text : [];
  const parts = [];
  const QR_TOKEN = /^\s*\{\{qr:([\s\S]*?)\}\}\s*$/i;
  for (const raw of text) {
    const line = String(raw);
    const m = line.match(QR_TOKEN);
    if (m) {
      parts.push(CMD.alignCenter, buildQrCode(m[1], payload.qr || {}), CMD.lf, CMD.alignLeft);
    } else {
      parts.push(encodeText(line, ctx.codepage), CMD.lf);
    }
  }
  const tail = typeof payload.qrcode === "string" ? { data: payload.qrcode } : payload.qrcode;
  if (tail && tail.data) {
    const o = payload.qr || {};
    parts.push(
      CMD.alignCenter,
      buildQrCode(tail.data, { size: tail.size || o.size, ec: tail.ec || o.ec }),
      CMD.lf,
      CMD.alignLeft
    );
  }
  return Buffer.concat(parts);
}

/**
 * Monta o documento ESC/POS completo a partir do payload do /print.
 * @param {object} payload { blocks?, text?, cut?, drawer?, paperWidth?, encoding?, qr?, qrcode? }
 */
function buildDocument(payload = {}) {
  const codepage = payload.encoding || "cp860";
  const ctx = {
    codepage,
    cols: colsForWidth(payload.paperWidth || 80),
    paperWidth: Number(payload.paperWidth) || 80
  };

  const parts = [CMD.init, selectCodepage(codepage)];
  let didCut = false;

  if (Array.isArray(payload.blocks)) {
    for (const block of payload.blocks) {
      if (block && String(block.type) === "cut") didCut = true;
      parts.push(renderBlock(block, ctx));
    }
  } else {
    parts.push(renderLegacyText(payload, ctx));
  }

  parts.push(bytes(0x0a, 0x0a));
  if (payload.drawer) parts.push(bytes(ESC, 0x70, 0, 25, 250));
  if (!didCut && payload.cut !== false) {
    parts.push(payload.cutMode === "partial" ? CMD.cutPartial : CMD.cutFull);
  }
  return Buffer.concat(parts);
}

const CAPABILITIES = [
  "text", "blocks", "html", "image",
  "qr", "kv", "table", "divider", "feed", "cut", "drawer"
];

module.exports = { buildDocument, buildQrCode, colsForWidth, CAPABILITIES };
