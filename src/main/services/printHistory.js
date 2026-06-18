// Histórico de impressões em memória (mais recentes primeiro).
// Permite auditar no app quais cupons foram impressos, quais falharam
// e a origem de cada um (teste manual ou requisição do sistema web).

const MAX_ENTRIES = 200;

let entries = [];
let listener = null;

/** Extrai linhas legíveis do payload (formato blocks ou text) para exibir. */
function cleanLines(payload) {
  let raw = [];
  if (Array.isArray(payload?.blocks)) {
    for (const b of payload.blocks) {
      if (!b || typeof b !== "object") continue;
      if (typeof b.value === "string") raw.push(b.value);
      else if (b.left != null || b.right != null)
        raw.push(`${b.left || ""} ${b.right || ""}`);
      else if (b.type === "qr") raw.push("[QR Code]");
      else if (b.type === "table") raw.push("[itens]");
    }
  } else if (Array.isArray(payload?.text)) {
    raw = payload.text;
  }
  return raw
    .map((l) => String(l).replace(/[\x00-\x1f]/g, "").trim())
    .filter((l) => l.length > 0);
}

function summarize(payload) {
  const lines = cleanLines(payload);
  const title = lines.find(Boolean) || "Cupom";
  return {
    title: title.slice(0, 60),
    preview: lines.slice(0, 8),
    lineCount: lines.length
  };
}

/**
 * Registra uma tentativa de impressão.
 * @param {{ source: string, payload?: object, status: "ok"|"error",
 *           printerName?: string, error?: string }} info
 */
function add(info) {
  const s = summarize(info.payload);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toISOString(),
    source: info.source || "http", // "test" | "http"
    title: s.title,
    preview: s.preview,
    lineCount: s.lineCount,
    printerName: info.printerName || "",
    status: info.status === "ok" ? "ok" : "error",
    error: info.error || ""
  };

  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }

  if (listener) {
    try {
      listener(entry);
    } catch {}
  }

  return entry;
}

function list() {
  return entries.slice();
}

function stats() {
  let ok = 0;
  let error = 0;
  for (const e of entries) {
    if (e.status === "ok") ok += 1;
    else error += 1;
  }
  return { total: entries.length, ok, error };
}

function clear() {
  entries = [];
}

/** Registra um callback chamado a cada nova entrada (para enviar à UI). */
function onAdd(fn) {
  listener = typeof fn === "function" ? fn : null;
}

module.exports = { add, list, stats, clear, onAdd };
