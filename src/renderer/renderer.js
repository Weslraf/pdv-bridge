const printerSelect = document.getElementById("printerSelect");
const refreshBtn = document.getElementById("refreshBtn");
const testPrintBtn = document.getElementById("testPrintBtn");
const savedState = document.getElementById("savedState");
const setupBanner = document.getElementById("setupBanner");
const startupToggle = document.getElementById("startupToggle");
const statusText = document.getElementById("statusText");
const versionBadge = document.getElementById("versionBadge");
const baseUrlDisplay = document.getElementById("baseUrlDisplay");
const copyBaseBtn = document.getElementById("copyBaseBtn");
const openHealthBtn = document.getElementById("openHealthBtn");
const openHintsBtn = document.getElementById("openHintsBtn");
const copyFetchBtn = document.getElementById("copyFetchBtn");

const connDot = document.getElementById("connDot");
const connLabel = document.getElementById("connLabel");
const heroState = document.getElementById("heroState");
const heroHint = document.getElementById("heroHint");

const pinBtn = document.getElementById("pinBtn");
const minBtn = document.getElementById("minBtn");
const closeBtn = document.getElementById("closeBtn");

const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const statTotal = document.getElementById("statTotal");
const statOk = document.getElementById("statOk");
const statErr = document.getElementById("statErr");

let baseUrl = "http://localhost:8181";
let pinned = true;
let isOnline = false;
let savedPrinter = "";
const entries = [];

function setStatus(message) {
  statusText.textContent = message;
}

function buildFetchSnippet() {
  return `fetch("${baseUrl}/health", {\n  method: "GET",\n  targetAddressSpace: "loopback"\n})`;
}

/* ---------- Estado geral (hero + onboarding) ---------- */
function updateHero() {
  connDot.classList.toggle("is-online", isOnline);
  connDot.classList.toggle("is-off", !isOnline);
  connLabel.textContent = isOnline ? "online · loopback" : "offline";

  heroState.classList.remove("is-off", "is-warn");

  if (!isOnline) {
    heroState.textContent = "Offline";
    heroState.classList.add("is-off");
    heroHint.textContent = "O serviço local não respondeu. Reabra o app.";
  } else if (!savedPrinter) {
    heroState.textContent = "Configurar";
    heroState.classList.add("is-warn");
    heroHint.textContent = "Escolha sua impressora para começar.";
  } else {
    heroState.textContent = "Pronto";
    heroHint.textContent = "Impressão automática ativa.";
  }

  // Onboarding aparece enquanto não houver impressora salva.
  if (setupBanner) setupBanner.hidden = Boolean(savedPrinter);
}

function updateSavedState() {
  if (savedPrinter) {
    savedState.textContent = `✓ Impressora salva: ${savedPrinter}`;
    savedState.classList.add("is-saved");
  } else {
    savedState.textContent = "Selecione sua impressora acima.";
    savedState.classList.remove("is-saved");
  }
}

async function pingHealth() {
  try {
    const r = await fetch(`${baseUrl}/health`, { method: "GET" });
    isOnline = r.ok;
  } catch {
    isOnline = false;
  }
  updateHero();
}

/* ---------- Impressoras ---------- */
function fillPrinterOptions(printers, selectedPrinterName) {
  printerSelect.innerHTML = "";

  if (!printers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma impressora encontrada";
    printerSelect.appendChild(option);
    return;
  }

  // Placeholder quando ainda não há nada salvo.
  if (!selectedPrinterName) {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "— escolha sua impressora —";
    ph.disabled = true;
    ph.selected = true;
    printerSelect.appendChild(ph);
  }

  printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer.name;
    option.textContent = printer.isDefault
      ? `${printer.name} (padrão)`
      : printer.name;
    if (printer.name === selectedPrinterName) {
      option.selected = true;
    }
    printerSelect.appendChild(option);
  });
}

async function loadAppInfo() {
  const info = await window.bridgeApi.getAppInfo();
  baseUrl = info.baseUrl || baseUrl;
  versionBadge.textContent = `v${info.version || "?"}`;
  baseUrlDisplay.textContent = baseUrl;
}

async function loadPrinters() {
  const [printers, selectedPrinterName] = await Promise.all([
    window.bridgeApi.getPrinters(),
    window.bridgeApi.getSelectedPrinter()
  ]);
  savedPrinter = selectedPrinterName || "";
  fillPrinterOptions(printers, savedPrinter);
  updateSavedState();
  updateHero();
}

async function loadStartupPreference() {
  const enabled = await window.bridgeApi.getStartWithWindows();
  startupToggle.checked = Boolean(enabled);
}

/* ---------- Histórico ---------- */
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const ICON_OK =
  '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ERR =
  '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';

function renderStats() {
  const ok = entries.filter((e) => e.status === "ok").length;
  const err = entries.length - ok;
  statTotal.textContent = String(entries.length);
  statOk.textContent = String(ok);
  statErr.textContent = String(err);
}

function buildHistItem(entry) {
  const isOk = entry.status === "ok";
  const li = document.createElement("li");
  li.className = `hist-item ${isOk ? "is-ok" : "is-error"}`;

  const icon = document.createElement("span");
  icon.className = `hist-icon ${isOk ? "hist-icon--ok" : "hist-icon--err"}`;
  icon.innerHTML = isOk ? ICON_OK : ICON_ERR;

  const body = document.createElement("div");
  body.className = "hist-body";

  const title = document.createElement("div");
  title.className = "hist-title";
  title.textContent = entry.title || "Cupom";

  const meta = document.createElement("div");
  meta.className = "hist-meta";
  const tag = document.createElement("span");
  tag.className = `hist-tag ${entry.source === "test" ? "hist-tag--test" : ""}`;
  tag.textContent = entry.source === "test" ? "teste" : "sistema";
  const time = document.createElement("span");
  time.textContent = fmtTime(entry.time);
  const lines = document.createElement("span");
  lines.textContent = `${entry.lineCount} linha(s)`;
  meta.append(tag, time, lines);

  body.append(title, meta);

  if (!isOk && entry.error) {
    const err = document.createElement("div");
    err.className = "hist-err-msg";
    err.textContent = entry.error;
    body.appendChild(err);
  }

  li.append(icon, body);
  return li;
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "hist-empty";
    li.textContent =
      "Nenhum cupom ainda. Os pedidos enviados pelo seu sistema aparecem aqui.";
    historyList.appendChild(li);
    renderStats();
    return;
  }
  for (const entry of entries) {
    historyList.appendChild(buildHistItem(entry));
  }
  renderStats();
}

function prependEntry(entry) {
  entries.unshift(entry);
  if (entries.length > 200) entries.length = 200;
  renderHistory();
}

async function loadHistory() {
  const data = await window.bridgeApi.getHistory();
  entries.length = 0;
  if (data && Array.isArray(data.entries)) {
    entries.push(...data.entries);
  }
  renderHistory();
}

/* ---------- Eventos ---------- */
refreshBtn.addEventListener("click", () => {
  loadPrinters();
  pingHealth();
  setStatus("Lista de impressoras atualizada.");
});

// Salvar automaticamente ao escolher a impressora — sem botão extra.
printerSelect.addEventListener("change", async () => {
  const selected = printerSelect.value;
  if (!selected) return;
  await window.bridgeApi.setSelectedPrinter(selected);
  savedPrinter = selected;
  updateSavedState();
  updateHero();
  setStatus(`Impressora salva: ${selected}`);
});

testPrintBtn.addEventListener("click", async () => {
  if (!savedPrinter) {
    setStatus("Escolha sua impressora primeiro.");
    return;
  }
  setStatus("Enviando teste para a impressora…");
  const result = await window.bridgeApi.printTest();
  if (result.ok) {
    setStatus("Teste enviado. Verifique o papel da impressora.");
  } else {
    setStatus(result.error || "Falha no teste.");
  }
});

startupToggle.addEventListener("change", async (event) => {
  await window.bridgeApi.setStartWithWindows(event.target.checked);
  setStatus(
    event.target.checked
      ? "O Uno Print abrirá com o Windows."
      : "Início automático desativado."
  );
});

copyBaseBtn.addEventListener("click", async () => {
  await window.bridgeApi.copyText(baseUrl);
  setStatus("URL copiada para a área de transferência.");
});

openHealthBtn.addEventListener("click", async () => {
  const r = await window.bridgeApi.openExternal(`${baseUrl}/health`);
  if (!r.ok) setStatus(r.error || "Não foi possível abrir o navegador.");
});

openHintsBtn.addEventListener("click", async () => {
  const r = await window.bridgeApi.openExternal(`${baseUrl}/client-hints`);
  if (!r.ok) setStatus(r.error || "Não foi possível abrir o navegador.");
});

copyFetchBtn.addEventListener("click", async () => {
  await window.bridgeApi.copyText(buildFetchSnippet());
  setStatus("Exemplo de fetch copiado (com targetAddressSpace).");
});

clearHistoryBtn.addEventListener("click", async () => {
  await window.bridgeApi.clearHistory();
  entries.length = 0;
  renderHistory();
  setStatus("Histórico limpo.");
});

/* ---------- Controles da janela ---------- */
pinBtn.addEventListener("click", async () => {
  pinned = !pinned;
  const r = await window.bridgeApi.setPinned(pinned);
  pinned = r.pinned;
  pinBtn.classList.toggle("is-active", pinned);
  pinBtn.title = pinned ? "Fixar no topo (ativo)" : "Fixar no topo (desativado)";
});

minBtn.addEventListener("click", () => window.bridgeApi.minimizeWindow());
closeBtn.addEventListener("click", () => window.bridgeApi.hideWindow());

/* ---------- Push de servidor / histórico ---------- */
window.bridgeApi.onServerLog((message) => {
  setStatus(message);
});

window.bridgeApi.onHistoryAdded((entry) => {
  prependEntry(entry);
  isOnline = true;
  updateHero();
});

/* ---------- Init ---------- */
(async function init() {
  await loadAppInfo();
  await Promise.all([loadPrinters(), loadStartupPreference(), loadHistory()]);
  await pingHealth();
  setInterval(pingHealth, 8000);
  setStatus("Pronto.");
})();
