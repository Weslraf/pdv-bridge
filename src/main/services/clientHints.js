const rootPackage = require("../../../package.json");

/**
 * JSON para o front (ou dev) alinhar fetch, Chrome LNA e testes.
 * GET /client-hints (sem auth; so loopback).
 */
function buildClientHints(port) {
  const base = `http://localhost:${port}`;
  const baseIpv4 = `http://127.0.0.1:${port}`;
  const v = rootPackage.version || "0.0.0";

  return {
    ok: true,
    service: "pdv-bridge",
    version: v,
    endpoints: {
      health: `${base}/health`,
      clientHints: `${base}/client-hints`,
      print: `${base}/print`,
      printers: `${base}/printers`
    },
    recommendedBaseUrl: base,
    alternateBaseUrlIpv4: baseIpv4,
    fetch: {
      targetAddressSpaceLoopback:
        "Use sempre para localhost e 127.0.0.1 (Chrome Local Network Access).",
      targetAddressSpaceLocal:
        "Somente se no futuro o bridge escutar em IP de LAN (ex.: 192.168.x.x).",
      exampleHealth: `fetch("${base}/health", { method: "GET", targetAddressSpace: "loopback" })`,
      examplePrint: `fetch("${base}/print", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  targetAddressSpace: "loopback",\n  body: JSON.stringify({ text: ["Linha 1", "Obrigado"], cut: true })\n})`
    },
    chrome: {
      localNetworkAccess:
        "Chrome 138+ pode exigir permissao para o site acessar loopback. A primeira chamada apos um clique do usuario costuma mostrar o prompt.",
      iframeWarning:
        "Se o seu SaaS roda dentro de um iframe (ex.: preview Lovable), o navegador pode bloquear loopback mesmo com permissao no site: o documento PAI precisa de allow=\"local-network-access\" no iframe. Teste em aba propria (producao) ou localhost dev.",
      settingsUrl: "chrome://settings/content/localNetworkAccess"
    },
    bodyPrintExample: {
      text: ["Uno Print", "Teste de impressao", "----------------"],
      cut: true
    },
    qrcode: {
      comoUsar:
        "Para imprimir QR (ex.: PIX copia-e-cola), use uma das opcoes abaixo. " +
        "A impressora precisa suportar QR nativo ESC/POS (ex.: Bematech MP-4200).",
      viaTokenNaLinha: {
        text: [
          "Pague com PIX:",
          "{{qr:00020126...5204000053039865802BR6304ABCD}}",
          "Obrigado!"
        ],
        cut: true
      },
      viaCampoEstruturado: {
        text: ["Pedido #1886", "TOTAL: R$ 50,00"],
        qrcode: "00020126...5204000053039865802BR6304ABCD",
        qr: { size: 6, ec: "M" },
        cut: true
      }
    }
  };
}

module.exports = { buildClientHints };
