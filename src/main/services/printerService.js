const { ThermalPrinter, PrinterTypes } = require("node-thermal-printer");

function formatPrinterInterface(printerName) {
  return `printer:${printerName}`;
}

async function printEscPos(printerName, payload = {}) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: formatPrinterInterface(printerName),
    removeSpecialCharacters: false,
    lineCharacter: "-"
  });

  const isConnected = await printer.isPrinterConnected();
  if (!isConnected) {
    throw new Error(`Impressora nao encontrada ou indisponivel: ${printerName}`);
  }

  const {
    text = [],
    cut = true,
    beep = false,
    openCashDrawer = false
  } = payload;

  text.forEach((line) => printer.println(String(line)));

  if (beep) printer.beep();
  if (openCashDrawer) printer.openCashDrawer();
  if (cut) printer.cut();

  await printer.execute();
}

module.exports = {
  printEscPos
};
