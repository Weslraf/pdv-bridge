const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ----- Comandos ESC/POS -----
const ESC = "\x1B";
const GS = "\x1D";
const INIT = ESC + "@";                  // reseta a impressora
const CUT_FULL = GS + "V" + "\x00";       // corte total (GS V 0) - padrao moderno
const ALIGN_CENTER = ESC + "a" + "\x01";  // centraliza
const ALIGN_LEFT = ESC + "a" + "\x00";    // alinha a esquerda
// alternativa de corte para impressoras antigas: ESC + "i"

// Token em linha de texto que vira um QR Code: {{qr:DADOS}}
const QR_TOKEN = /^\s*\{\{qr:([\s\S]*?)\}\}\s*$/i;

// Mapa de correcao de erro do QR (ESC/POS): L, M, Q, H.
const QR_EC = { L: 48, M: 49, Q: 50, H: 51 };

/**
 * Gera os comandos ESC/POS de um QR Code nativo (GS ( k, modelo 2).
 * Suportado por impressoras ESC/POS modernas, incluindo a Bematech MP-4200.
 * @param {string} data conteudo do QR (ex.: copia-e-cola PIX, URL).
 * @param {{ size?: number, ec?: string }} opts
 */
function buildQrCode(data, opts = {}) {
  const payload = Buffer.from(String(data), "latin1");
  const storeLen = payload.length + 3;
  const pL = storeLen & 0xff;
  const pH = (storeLen >> 8) & 0xff;
  const size = Math.min(16, Math.max(1, parseInt(opts.size, 10) || 6));
  const ec = QR_EC[String(opts.ec || "M").toUpperCase()] || QR_EC.M;

  return Buffer.concat([
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]), // modelo 2
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size]),       // tamanho do modulo
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, ec]),         // correcao de erro
    Buffer.from([0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30]),           // armazena dados
    payload,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30])        // imprime
  ]);
}

/** Emite um QR centralizado e volta o alinhamento para a esquerda. */
function centeredQr(data, opts) {
  return Buffer.concat([
    Buffer.from(ALIGN_CENTER, "latin1"),
    buildQrCode(data, opts),
    Buffer.from("\r\n" + ALIGN_LEFT, "latin1")
  ]);
}

/**
 * Monta o buffer ESC/POS do cupom.
 * Compativel com o formato antigo { text: string[], cut }. Alem disso:
 *  - qualquer linha no formato {{qr:DADOS}} vira um QR Code centralizado;
 *  - o campo opcional qrcode (string ou { data, size, ec }) imprime um QR no rodape.
 * size/ec padrao podem vir em payload.qr = { size, ec }.
 * Usamos latin1 para preservar 1 byte por caractere (inclui bytes de controle).
 */
function buildEscPosBuffer(payload = {}) {
  const { text = [], cut = true, qr = {}, qrcode } = payload;
  const defSize = qr.size || 6;
  const defEc = qr.ec || "M";

  const parts = [Buffer.from(INIT, "latin1")];

  for (const raw of text) {
    const line = String(raw);
    const match = line.match(QR_TOKEN);
    if (match) {
      parts.push(centeredQr(match[1], { size: defSize, ec: defEc }));
    } else {
      parts.push(Buffer.from(line + "\r\n", "latin1"));
    }
  }

  const tail = typeof qrcode === "string" ? { data: qrcode } : qrcode;
  if (tail && tail.data) {
    parts.push(
      centeredQr(tail.data, {
        size: tail.size || defSize,
        ec: tail.ec || defEc
      })
    );
  }

  parts.push(Buffer.from("\r\n\r\n", "latin1"));
  if (cut) parts.push(Buffer.from(CUT_FULL, "latin1"));
  return Buffer.concat(parts);
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

module.exports = { printEscPos, getPrinters, buildEscPosBuffer };
