// Teste visual do modo imagem: renderiza um cupom e salva dist/receipt-preview.png
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const { buildReceiptHtml } = require(path.join(root, "src/main/services/htmlBuilder"));
const { captureHtml, buildImageDocument } = require(path.join(root, "src/main/services/imageRenderer"));

const payload = {
  paperWidth: 80,
  cut: true,
  blocks: [
    { type: "text", value: "FORTUNATO BEBIDAS LTDA", align: "center", bold: true, size: "large" },
    { type: "text", value: "Rua São João, 123 - CONVENIÊNCIA", align: "center" },
    { type: "text", value: "CNPJ: 60.761.297/0001-30", align: "center" },
    { type: "divider", style: "solid" },
    { type: "text", value: "CUPOM NÃO FISCAL", align: "center", bold: true },
    { type: "divider", style: "dashed" },
    { type: "kv", left: "Data:", right: "17/06/2026 20:04:44" },
    { type: "kv", left: "Cliente:", right: "José Conceição" },
    { type: "table", header: ["QTD", "PRODUTO", "VL.UNIT", "VL.TOTAL"], rows: [
      ["1", "51 ICE FRUIT MIX LONG NECK", "7,00", "7,00"],
      ["7", "51 ICE BALADA LONG NECK", "7,00", "49,00"]
    ] },
    { type: "divider", style: "dashed" },
    { type: "kv", left: "SUBTOTAL PRODUTOS:", right: "R$ 56,00", bold: true },
    { type: "kv", left: "TAXA DE ENTREGA:", right: "R$ 5,99" },
    { type: "kv", left: "TOTAL:", right: "R$ 61,99", bold: true, size: "large" },
    { type: "kv", left: "Forma de Pagamento:", right: "Dinheiro" },
    { type: "kv", left: "TROCO:", right: "R$ 38,01", bold: true },
    { type: "divider", style: "dashed" },
    { type: "text", value: "QR ENTREGA - MOTOBOY", align: "center", bold: true },
    { type: "qr", data: "https://app.unotecx.com/entrega/a1b2c3d4-5e6f", size: 8, align: "center", errorCorrection: "M" },
    { type: "text", value: "Escaneie para assumir a entrega", align: "center", size: "small" },
    { type: "feed", lines: 2 }
  ]
};

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const html = buildReceiptHtml(payload);
    const image = await captureHtml(html, 576);
    fs.writeFileSync(path.join(root, "dist/receipt-preview.png"), image.toPNG());
    const doc = await buildImageDocument(payload, html);
    console.log("imagem:", image.getSize(), "| raster bytes:", doc.length);
    console.log("inicia ESC @:", doc[0] === 0x1b && doc[1] === 0x40);
    console.log("tem GS v 0:", doc.includes(Buffer.from([0x1d, 0x76, 0x30])));
  } catch (e) {
    console.log("ERRO:", e.message, e.stack);
  }
  app.quit();
});
