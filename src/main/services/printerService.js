const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

async function printEscPos(printerName, payload = {}) {
  const {
    text = [],
    cut = true
  } = payload;

  // Monta o conteúdo do cupom
  const content = text.join("\r\n") + (cut ? "\r\n\x1B\x69" : "");

  // Salva em arquivo temporário
  const tmpFile = path.join(os.tmpdir(), `cupom_${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, content, "binary");

  // Envia para a impressora via Windows
  return new Promise((resolve, reject) => {
    const cmd = `print /D:"${printerName}" "${tmpFile}"`;
    exec(cmd, (error, stdout, stderr) => {
      // Remove arquivo temporário
      try { fs.unlinkSync(tmpFile); } catch {}
      
      if (error) {
        reject(new Error(`Erro ao imprimir: ${error.message}`));
      } else {
        resolve(true);
      }
    });
  });
}

async function getPrinters() {
  return new Promise((resolve) => {
    exec(`wmic printer get name`, (error, stdout) => {
      if (error) { resolve([]); return; }
      const printers = stdout
        .split("\n")
        .map(l => l.trim())
        .filter(l => l && l !== "Name");
      resolve(printers);
    });
  });
}

module.exports = { printEscPos, getPrinters };