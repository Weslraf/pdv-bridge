// Histórico de impressões em memória (mais recentes primeiro).
// Permite auditar no app quais cupons foram impressos, quais falharam
// e a origem de cada um (teste manual ou requisição do sistema web).

const MAX_ENTRIES = 200;

let entries = [];
let listener = null;

/** Remove bytes de controle ESC/POS para exibir o texto de forma legível. */
function cleanLines(payload) {
  const text = Array.isArray(payload?.text) ? payload.text : [];
  return text
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
