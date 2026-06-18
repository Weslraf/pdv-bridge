// Converte o payload do /print (blocks ou text) em HTML do cupom, pronto para
// ser renderizado pelo Chromium e rasterizado (modo imagem). Garante paridade
// visual com o cupom do site e acentos/caracteres especiais sempre corretos.

const qrcode = require("qrcode-generator");

const DOTS = { 80: 576, 58: 384 };

function dotsFor(paperWidth) {
  return DOTS[Number(paperWidth)] || 576;
}

function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function qrSvg(data, opts = {}) {
  const ec = String(opts.errorCorrection || opts.ec || "M").toUpperCase();
  const level = ["L", "M", "Q", "H"].includes(ec) ? ec : "M";
  const qr = qrcode(0, level); // typeNumber 0 = auto
  qr.addData(String(data == null ? "" : data));
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
}

function classesForText(block) {
  const c = ["t"];
  if (block.bold) c.push("b");
  if (block.underline) c.push("u");
  if (block.align === "center") c.push("al-center");
  else if (block.align === "right") c.push("al-right");
  const size = String(block.size || "normal");
  if (size === "small") c.push("sz-small");
  else if (size === "large" || size === "double") c.push("sz-large");
  return c.join(" ");
}

function blockToHtml(block) {
  if (!block || typeof block !== "object") return "";
  switch (String(block.type)) {
    case "text":
      return `<div class="${classesForText(block)}">${esc(block.value)}</div>`;
    case "divider": {
      const style = ["dashed", "dotted"].includes(String(block.style))
        ? block.style
        : "solid";
      return `<div class="div ${style}"></div>`;
    }
    case "kv": {
      const c = ["kv"];
      if (block.bold) c.push("b");
      if (block.size === "large" || block.size === "double") c.push("sz-large");
      return `<div class="${c.join(" ")}"><span class="l">${esc(
        block.left
      )}</span><span class="r">${esc(block.right)}</span></div>`;
    }
    case "table": {
      const header = block.header || [];
      const rows = block.rows || [];
      const cols = header.length || (rows[0] ? rows[0].length : 0);
      const numericCol = [];
      for (let i = 0; i < cols; i++) {
        const cells = rows.map((r) => String(r[i] == null ? "" : r[i]));
        numericCol[i] =
          cells.length > 0 &&
          cells.every((v) => v === "" || /^[\d.,()R$%\-\s]+$/.test(v));
      }
      let html = "<table>";
      if (header.some((h) => h)) {
        html += "<tr>";
        header.forEach((h, i) => {
          html += `<th class="${numericCol[i] ? "num" : ""}">${esc(h)}</th>`;
        });
        html += "</tr>";
      }
      rows.forEach((r) => {
        html += "<tr>";
        for (let i = 0; i < cols; i++) {
          html += `<td class="${numericCol[i] ? "num" : ""}">${esc(r[i])}</td>`;
        }
        html += "</tr>";
      });
      html += "</table>";
      return html;
    }
    case "qr": {
      const px = Math.min(16, Math.max(3, parseInt(block.size, 10) || 6)) * 30;
      const align =
        block.align === "left"
          ? "flex-start"
          : block.align === "right"
          ? "flex-end"
          : "center";
      return `<div class="qr" style="justify-content:${align}"><div style="width:${px}px">${qrSvg(
        block.data,
        block
      )}</div></div>`;
    }
    case "feed":
      return `<div style="height:${Math.max(1, block.lines || 1) * 16}px"></div>`;
    case "cut":
    case "drawer":
    case "beep":
      return ""; // tratados fora do HTML (apos o raster)
    default:
      if (block.value != null)
        return `<div class="${classesForText(block)}">${esc(block.value)}</div>`;
      return "";
  }
}

// Compat: { text: [...] } com tokens {{qr:...}} vira HTML monoespacado.
function textToInnerHtml(payload) {
  const text = Array.isArray(payload.text) ? payload.text : [];
  const QR_TOKEN = /^\s*\{\{qr:([\s\S]*?)\}\}\s*$/i;
  const parts = [];
  let buffer = [];
  const flush = () => {
    if (buffer.length) {
      parts.push(`<pre class="mono">${esc(buffer.join("\n"))}</pre>`);
      buffer = [];
    }
  };
  for (const raw of text) {
    const line = String(raw);
    const m = line.match(QR_TOKEN);
    if (m) {
      flush();
      const px = (payload.qr && payload.qr.size ? payload.qr.size : 6) * 30;
      parts.push(
        `<div class="qr"><div style="width:${px}px">${qrSvg(
          m[1],
          payload.qr || {}
        )}</div></div>`
      );
    } else {
      buffer.push(line);
    }
  }
  flush();
  const tail =
    typeof payload.qrcode === "string" ? { data: payload.qrcode } : payload.qrcode;
  if (tail && tail.data) {
    const px = (tail.size || (payload.qr && payload.qr.size) || 6) * 30;
    parts.push(
      `<div class="qr"><div style="width:${px}px">${qrSvg(tail.data, {
        errorCorrection: tail.ec || (payload.qr && payload.qr.ec)
      })}</div></div>`
    );
  }
  return parts.join("");
}

function baseCss(width) {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; color: #000; }
  body { width: ${width}px; font-family: 'Segoe UI', Arial, sans-serif;
         font-size: 22px; line-height: 1.3; padding: 8px 12px; }
  .t { white-space: pre-wrap; word-break: break-word; }
  .b { font-weight: 700; }
  .u { text-decoration: underline; }
  .sz-small { font-size: 18px; }
  .sz-large { font-size: 32px; font-weight: 700; }
  .al-center { text-align: center; }
  .al-right { text-align: right; }
  .div { margin: 5px 0; height: 0; }
  .div.solid { border-top: 2px solid #000; }
  .div.dashed { border-top: 2px dashed #000; }
  .div.dotted { border-top: 3px dotted #000; }
  .kv { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
  .kv .r { text-align: right; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th, td { font-size: 20px; vertical-align: top; padding: 1px 3px;
           text-align: left; word-break: break-word; }
  th { font-weight: 700; border-bottom: 1px solid #000; }
  .num { text-align: right; white-space: nowrap; }
  .qr { display: flex; justify-content: center; margin: 8px 0; }
  .qr svg { width: 100%; height: auto; display: block; }
  pre.mono { font-family: 'Consolas', 'Courier New', monospace; font-size: 21px;
             white-space: pre-wrap; word-break: break-word; }
  `;
}

/** Monta o HTML completo do cupom a partir do payload. */
function buildReceiptHtml(payload = {}) {
  const width = dotsFor(payload.paperWidth || 80);

  let inner;
  if (typeof payload.html === "string" && payload.html.trim()) {
    inner = `<div style="width:${width}px">${payload.html}</div>`;
  } else if (Array.isArray(payload.blocks)) {
    inner = payload.blocks.map(blockToHtml).join("");
  } else {
    inner = textToInnerHtml(payload);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCss(
    width
  )}</style></head><body>${inner}</body></html>`;
}

module.exports = { buildReceiptHtml, dotsFor };
