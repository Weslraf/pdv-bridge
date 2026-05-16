const http = require("http");
const express = require("express");
const { SERVER_PORT } = require("../config");
const { printEscPos } = require("../services/printerService");
const { buildClientHints } = require("../services/clientHints");
const {
  getSelectedPrinterName,
  setSelectedPrinterName
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
    const hints = buildClientHints(SERVER_PORT);
    res.json({
      ok: true,
      service: "pdv-bridge",
      version: hints.version,
      port: SERVER_PORT,
      urls: {
        preferForHttpsSites: hints.recommendedBaseUrl,
        ipv4: hints.alternateBaseUrlIpv4
      },
      chrome: {
        hint: hints.fetch.targetAddressSpaceLoopback,
        clientHintsUrl: hints.endpoints.clientHints
      }
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

  app.post("/print", async (req, res) => {
    try {
      const body = req.body || {};
      const selectedPrinterName =
        body.printerName || getSelectedPrinterName() || "";

      if (!selectedPrinterName) {
        return res.status(400).json({
          ok: false,
          error: "Nenhuma impressora selecionada."
        });
      }

      await printEscPos(selectedPrinterName, body);
      onPrintRequest?.(body);

      return res.json({
        ok: true,
        printerName: selectedPrinterName
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }
  });

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
