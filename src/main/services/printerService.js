const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ----- Comandos ESC/POS -----
const ESC = "\x1B";
const GS = "\x1D";
const INIT = ESC + "@";                 // reseta a impressora
const CUT_FULL = GS + "V" + "\x00";      // corte total (GS V 0) - padrao moderno
// alternativa para impressoras antigas: ESC + "i"

/**
 * Monta o buffer ESC/POS do cupom.
 * Usamos encoding latin1 para preservar 1 byte por caractere, incluindo
 * os bytes de controle ESC/POS (0x1B, 0x1D, etc.).
 */
function buildEscPosBuffer(payload = {}) {
  const { text = [], cut = true } = payload;
  let content = INIT + text.join("\r\n") + "\r\n\r\n\r\n";
  if (cut) content += CUT_FULL;
  return Buffer.from(content, "latin1");
}

/**
 * Escapa um valor para ser embutido com seguranca dentro de aspas simples
 * num script PowerShell ('' = aspas simples literal).
 */
function psQuote(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Envia bytes RAW direto ao spooler do Windows (Win32 winspool),
 * contornando o driver. Essencial para impressora termica ESC/POS,
 * pois o comando "print" mandava pelo driver e os bytes eram ignorados.
 */
function rawPrint(printerName, buffer) {
  return new Promise((resolve, reject) => {
    const stamp = Date.now();
    const binFile = path.join(os.tmpdir(), `cupom_${stamp}.bin`);
    const psFile = path.join(os.tmpdir(), `print_${stamp}.ps1`);

    try {
      fs.writeFileSync(binFile, buffer);
    } catch (e) {
      return reject(new Error(`Falha ao gravar arquivo temporario: ${e.message}`));
    }

    const script = `
$ErrorActionPreference = 'Stop'
$printer = '${psQuote(printerName)}'
$binPath = '${psQuote(binFile)}'
$bytes = [System.IO.File]::ReadAllBytes($binPath)

# Tenta obter a porta fisica da impressora (ex: USB001, COM1, LPT1)
$portName = $null
try {
  $portName = (Get-Printer -Name $printer -ErrorAction Stop).PortName
} catch {}

$usedPort = $false

# Se for porta fisica (nao de rede), escreve direto na porta — bypassa driver
if ($portName -and ($portName -match '^(USB|COM|LPT)')) {
  try {
    $portPath = '\\\\.\\\' + $portName
    $stream = [System.IO.File]::Open($portPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
    $usedPort = $true
  } catch {
    $usedPort = $false
  }
}

# Fallback: WritePrinter via winspool
if (-not $usedPort) {
  $src = @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool OpenPrinter(string src, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static void Send(string name, byte[] data) {
    IntPtr h;
    if(!OpenPrinter(name, out h, IntPtr.Zero)) throw new Exception("OpenPrinter falhou (codigo " + Marshal.GetLastWin32Error() + "). Verifique o nome da impressora.");
    try {
      var di = new DOCINFO(); di.pDocName = "Cupom PDV"; di.pDataType = "RAW";
      if(!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter falhou (codigo " + Marshal.GetLastWin32Error() + ").");
      try {
        StartPagePrinter(h);
        int written;
        if(!WritePrinter(h, data, data.Length, out written)) throw new Exception("WritePrinter falhou (codigo " + Marshal.GetLastWin32Error() + ").");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
  Add-Type -TypeDefinition $src -Language CSharp
  [RawPrinter]::Send($printer, $bytes)
}
`;

    try {
      fs.writeFileSync(psFile, script, "utf8");
    } catch (e) {
      try { fs.unlinkSync(binFile); } catch {}
      return reject(new Error(`Falha ao gravar script temporario: ${e.message}`));
    }

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psFile],
      { windowsHide: true },
      (error, stdout, stderr) => {
        try { fs.unlinkSync(binFile); } catch {}
        try { fs.unlinkSync(psFile); } catch {}

        if (error) {
          const detail = (stderr || stdout || error.message || "").trim();
          reject(new Error(`Erro ao imprimir (RAW): ${detail}`));
        } else {
          resolve(true);
        }
      }
    );
  });
}

async function printEscPos(printerName, payload = {}) {
  if (!printerName) {
    throw new Error("Nome da impressora vazio.");
  }
  const buffer = buildEscPosBuffer(payload);
  return rawPrint(printerName, buffer);
}

/**
 * Lista as impressoras instaladas via PowerShell (Get-Printer).
 * Observacao: o app usa o getPrintersAsync do Electron para popular a UI;
 * esta funcao fica como utilitario/fallback (wmic foi removido no Win11).
 */
async function getPrinters() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        const printers = stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l);
        resolve(printers);
      }
    );
  });
}

module.exports = { printEscPos, getPrinters };
