const printerSelect = document.getElementById("printerSelect");
const refreshBtn = document.getElementById("refreshBtn");
const savePrinterBtn = document.getElementById("savePrinterBtn");
const testPrintBtn = document.getElementById("testPrintBtn");
const startupToggle = document.getElementById("startupToggle");
const statusText = document.getElementById("statusText");
const versionBadge = document.getElementById("versionBadge");
const baseUrlDisplay = document.getElementById("baseUrlDisplay");
const copyBaseBtn = document.getElementById("copyBaseBtn");
const openHealthBtn = document.getElementById("openHealthBtn");
const openHintsBtn = document.getElementById("openHintsBtn");
const copyFetchBtn = document.getElementById("copyFetchBtn");

let baseUrl = "http://localhost:8181";

function setStatus(message) {
  statusText.textContent = message;
}

function buildFetchSnippet() {
  return `fetch("${baseUrl}/health", {\n  method: "GET",\n  targetAddressSpace: "loopback"\n})`;
}

function fillPrinterOptions(printers, selectedPrinterName) {
  printerSelect.innerHTML = "";

  if (!printers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma impressora encontrada";
    printerSelect.appendChild(option);
    return;
  }

  printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer.name;
    option.textContent = printer.isDefault
      ? `${printer.name} (padrao)`
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
  setStatus("Carregando impressoras…");
  const [printers, selectedPrinterName] = await Promise.all([
    window.bridgeApi.getPrinters(),
    window.bridgeApi.getSelectedPrinter()
  ]);
  fillPrinterOptions(printers, selectedPrinterName);
  setStatus(`Pronta. ${printers.length} impressora(s) encontrada(s).`);
}

async function loadStartupPreference() {
  const enabled = await window.bridgeApi.getStartWithWindows();
  startupToggle.checked = Boolean(enabled);
}

refreshBtn.addEventListener("click", loadPrinters);

savePrinterBtn.addEventListener("click", async () => {
  const selectedPrinter = printerSelect.value;
  await window.bridgeApi.setSelectedPrinter(selectedPrinter);
  setStatus(
    selectedPrinter
      ? `Impressora salva: ${selectedPrinter}`
      : "Nenhuma impressora selecionada."
  );
});

testPrintBtn.addEventListener("click", async () => {
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
      ? "O PDV Bridge abrira com o Windows."
      : "Inicio automatico desativado."
  );
});

copyBaseBtn.addEventListener("click", async () => {
  await window.bridgeApi.copyText(baseUrl);
  setStatus("URL copiada para a area de transferencia.");
});

openHealthBtn.addEventListener("click", async () => {
  const r = await window.bridgeApi.openExternal(`${baseUrl}/health`);
  if (!r.ok) setStatus(r.error || "Nao foi possivel abrir o navegador.");
});

openHintsBtn.addEventListener("click", async () => {
  const r = await window.bridgeApi.openExternal(`${baseUrl}/client-hints`);
  if (!r.ok) setStatus(r.error || "Nao foi possivel abrir o navegador.");
});

copyFetchBtn.addEventListener("click", async () => {
  await window.bridgeApi.copyText(buildFetchSnippet());
  setStatus("Exemplo de fetch copiado (com targetAddressSpace).");
});

window.bridgeApi.onServerLog((message) => {
  setStatus(message);
});

(async function init() {
  await loadAppInfo();
  await loadPrinters();
  await loadStartupPreference();
})();
