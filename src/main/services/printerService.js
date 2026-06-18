const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { buildDocument } = require("./escpos");
const { buildReceiptHtml } = require("./htmlBuilder");

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
try {
  $printer = '${psQuote(printerName)}'
  $binPath = '${psQuote(binFile)}'
  $bytes = [System.IO.File]::ReadAllBytes($binPath)

  # Aborta cedo se a impressora estiver marcada como OFFLINE no Windows.
  $offline = $false
  try {
    $cim = Get-CimInstance Win32_Printer -Filter ("Name='" + ($printer -replace "'", "''") + "'") -ErrorAction Stop
    if ($cim -and $cim.WorkOffline) { $offline = $true }
  } catch {}
  if ($offline) {
    throw "Impressora desligada ou desconectada. Ligue a impressora e confira o cabo."
  }

  # Tenta obter a porta fisica da impressora (ex: USB001, COM1, LPT1)
  $portName = $null
  try {
    $portName = (Get-Printer -Name $printer -ErrorAction Stop).PortName
  } catch {}

  $usedPort = $false

  # Se for porta fisica (nao de rede), escreve direto na porta -- bypassa driver
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
    if(!OpenPrinter(name, out h, IntPtr.Zero)) throw new Exception("Impressora nao encontrada. Selecione a impressora novamente na lista.");
    try {
      var di = new DOCINFO(); di.pDocName = "Cupom"; di.pDataType = "RAW";
      if(!StartDocPrinter(h, 1, di)) throw new Exception("Nao foi possivel iniciar a impressao. Verifique a impressora.");
      try {
        StartPagePrinter(h);
        int written;
        if(!WritePrinter(h, data, data.Length, out written)) throw new Exception("Nao foi possivel enviar o cupom. Verifique a impressora.");
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
    Add-Type -TypeDefinition $src -Language CSharp
    [RawPrinter]::Send($printer, $bytes)

    # O WritePrinter so enfileira: confirma que o spooler nao rejeitou o cupom.
    Start-Sleep -Milliseconds 400
    for ($i = 0; $i -lt 8; $i++) {
      $jobs = @(Get-PrintJob -PrinterName $printer -ErrorAction SilentlyContinue)
      if ($jobs.Count -eq 0) { break }
      $bad = $jobs | Where-Object { $_.JobStatus -match 'Error|Offline|PaperOut|Blocked|UserIntervention' }
      if ($bad) {
        throw "Nao foi possivel imprimir. Verifique se ha papel e se a impressora esta ligada."
      }
      Start-Sleep -Milliseconds 300
    }
  }

  Write-Output "UNOOK"
} catch {
  # Desempacota ate a excecao mais interna (o PowerShell embrulha erros do C#
  # em 'Excecao ao chamar Send...'); queremos so a mensagem amigavel original.
  $ex = $_.Exception
  while ($ex.InnerException) { $ex = $ex.InnerException }
  $m = $ex.Message
  if (-not $m) { $m = "Nao foi possivel imprimir. Verifique a impressora." }
  Write-Output ("UNOERR:" + $m)
  exit 1
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
      (error, stdout) => {
        try { fs.unlinkSync(binFile); } catch {}
        try { fs.unlinkSync(psFile); } catch {}

        const out = String(stdout || "");
        const idx = out.indexOf("UNOERR:");
        if (idx !== -1) {
          const msg =
            out.slice(idx + 7).trim() ||
            "Nao foi possivel imprimir. Verifique a impressora.";
          return reject(new Error(msg));
        }
        if (out.indexOf("UNOOK") !== -1) {
          return resolve(true);
        }
        // Saida inesperada (ex.: falha do proprio PowerShell): mensagem generica.
        if (error) {
          return reject(
            new Error(
              "Nao foi possivel imprimir. Verifique a impressora e tente novamente."
            )
          );
        }
        resolve(true);
      }
    );
  });
}

async function printEscPos(printerName, payload = {}) {
  if (!printerName) {
    throw new Error("Nome da impressora vazio.");
  }

  // Modo imagem (padrao): renderiza o cupom como imagem no Chromium e envia
  // como raster ESC/POS -> identico ao HTML, acentos/QR sempre corretos.
  // Modo texto: ESC/POS tradicional (mais rapido, depende de codepage).
  const mode = String(payload.mode || "image").toLowerCase();

  let buffer;
  if (mode === "text") {
    buffer = buildDocument(payload);
  } else {
    // require tardio: imageRenderer usa BrowserWindow (so disponivel no main).
    const { buildImageDocument } = require("./imageRenderer");
    const html = buildReceiptHtml(payload);
    buffer = await buildImageDocument(payload, html);
  }

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
