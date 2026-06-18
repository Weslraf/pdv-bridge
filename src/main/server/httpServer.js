const http = require("http");
const express = require("express");
const { SERVER_PORT, APP_VERSION } = require("../config");
const { printEscPos } = require("../services/printerService");
const { buildClientHints } = require("../services/clientHints");
const printHistory = require("../services/printHistory");
const { CAPABILITIES } = require("../services/escpos");
const {
  getSelectedPrinterName,
  setSelectedPrinterName,
  getPaperWidth,
  setPaperWidth,
  getEncoding,
  setEncoding,
  getPrintMode,
  setPrintMode
} = require("../services/settingsService");

/** CORS permissivo: so escuta em loopback (127.0.0.1 e ::1). */
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    // PNA + Chrome Local Network Access (preflight e respostas)
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return next();
}

function buildApp({ getPrinters, onPrintRequest }) {
  const app = express();
  app.set("trust proxy", false);
  app.use(corsMiddleware);
  app.use(express.json({ limit: "2mb" }));

  app.get("/", (_req, res) => {
    res.type("json").send(
      JSON.stringify(
        {
          ok: true,
          message: "PDV Bridge",
          health: `/health`,
          clientHints: `/client-hints`
        },
        null,
        2
      )
    );
  });
  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "pdv-bridge",
      product: "Uno Print",
      version: APP_VERSION,
      port: SERVER_PORT,
      printer: getSelectedPrinterName() || null,
      paperWidth: getPaperWidth(),
      encoding: getEncoding(),
      printMode: getPrintMode(),
      capabilities: CAPABILITIES
    });
  });

  app.get("/client-hints", (_req, res) => {
    res.json(buildClientHints(SERVER_PORT));
  });

  app.get("/printers", async (_req, res) => {
    const printers = await getPrinters();
    const selectedPrinterName = getSelectedPrinterName();
    res.json({
      selectedPrinterName,
      printers
    });
  });

  // Aceita tanto o formato estruturado { blocks: [...] } quanto o antigo
  // { text: [...] }. Aplica os padroes de largura/encoding configurados.
  async function handlePrint(req, res) {
    const body = req.body || {};
    const selectedPrinterName =
      body.printerName || getSelectedPrinterName() || "";

    if (!selectedPrinterName) {
      printHistory.add({
        source: "http",
        payload: body,
        status: "error",
        error: "Nenhuma impressora selecionada."
      });
      return res.status(400).json({
        ok: false,
        error: "Nenhuma impressora selecionada."
      });
    }

    const payload = {
      ...body,
      paperWidth: body.paperWidth || getPaperWidth(),
      encoding: body.encoding || getEncoding(),
      mode: body.mode || getPrintMode()
    };

    const startedAt = Date.now();
    try {
      await printEscPos(selectedPrinterName, payload);
      printHistory.add({
        source: "http",
        payload,
        status: "ok",
        printerName: selectedPrinterName
      });
      onPrintRequest?.(payload);

      return res.json({
        ok: true,
        printerName: selectedPrinterName,
        elapsedMs: Date.now() - startedAt
      });
    } catch (error) {
      printHistory.add({
        source: "http",
        payload,
        status: "error",
        printerName: selectedPrinterName,
        error: error.message
      });
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  }

  app.post("/print", handlePrint);
  app.post("/print-text", handlePrint); // compat: nome alternativo do mesmo endpoint

  app.post("/config/printer", (req, res) => {
    const { printerName } = req.body || {};
    if (!printerName) {
      return res.status(400).json({
        ok: false,
        error: "printerName e obrigatorio."
      });
    }

    setSelectedPrinterName(printerName);
    return res.json({ ok: true, printerName });
  });

  // Config geral: impressora, largura do papel (58/80) e encoding.
  app.post("/config", (req, res) => {
    const { printer, printerName, paperWidth, encoding, mode } = req.body || {};
    const printerToSet = printer || printerName;
    if (printerToSet) setSelectedPrinterName(printerToSet);
    if (paperWidth) setPaperWidth(paperWidth);
    if (encoding) setEncoding(encoding);
    if (mode) setPrintMode(mode);
    return res.json({
      ok: true,
      printer: getSelectedPrinterName() || null,
      paperWidth: getPaperWidth(),
      encoding: getEncoding(),
      printMode: getPrintMode()
    });
  });

  return app;
}

function listenLoopback(app) {
  const servers = [];

  function bind(host) {
    return new Promise((resolve, reject) => {
      const srv = http.createServer(app);
      srv.once("error", reject);
      srv.listen(SERVER_PORT, host, () => {
        srv.removeListener("error", reject);
        servers.push(srv);
        resolve(host);
      });
    });
  }

  return bind("127.0.0.1")
    .then((host) => {
      console.log(
        `[PDV Bridge] HTTP em http://${host}:${SERVER_PORT} (e alias localhost IPv4)`
      );
      return bind("::1").catch((err) => {
        console.warn(
          `[PDV Bridge] IPv6 loopback (::1) nao disponivel: ${err.message}`
        );
      });
    })
    .then(() => {
      if (servers.length > 1) {
        console.log(
          `[PDV Bridge] Tambem em http://localhost:${SERVER_PORT} quando localhost -> ::1`
        );
      }
    })
    .then(() => ({
      servers,
      close(callback) {
        let pending = servers.length;
        if (!pending) {
          callback?.();
          return;
        }
        servers.forEach((s) => {
          s.close(() => {
            pending -= 1;
            if (pending <= 0) callback?.();
          });
        });
      }
    }));
}

async function createHttpServer({ getPrinters, onPrintRequest }) {
  const app = buildApp({ getPrinters, onPrintRequest });
  return listenLoopback(app);
}

module.exports = { createHttpServer };
