// ============================================================
// Cliente PDV Bridge — cole/adapte isto no seu SaaS web (front).
// O bridge roda localmente na máquina do caixa em 127.0.0.1:8181.
// ============================================================

const BRIDGE_URL = "http://127.0.0.1:8181";

// fetch que declara ao Chrome que o destino é a rede loopback.
// Necessário quando seu site é HTTPS público (Private Network Access).
async function bridgeFetch(path, options = {}) {
  return fetch(`${BRIDGE_URL}${path}`, {
    ...options,
    // @ts-ignore — opção do Chrome para PNA
    targetAddressSpace: "loopback",
  });
}

// 1) Verifica se o bridge está rodando na máquina.
export async function bridgeOnline() {
  try {
    const r = await bridgeFetch("/health");
    return r.ok;
  } catch {
    return false; // app fechado, porta diferente, etc.
  }
}

// 2) Imprime um cupom. `linhas` = array de strings (uma por linha).
//    Lança erro se não imprimir — use try/catch e NÃO marque como
//    impresso no seu backend se cair no catch (assim reimprime depois).
export async function imprimirCupom(linhas, { printerName, cut = true } = {}) {
  const r = await bridgeFetch("/print", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: linhas, cut, printerName }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `Falha na impressão (HTTP ${r.status})`);
  }
  return data; // { ok: true, printerName: "..." }
}

// ------------------------------------------------------------
// Exemplo de montagem de um cupom simples.
// Para negrito/centralizado etc., dá pra embutir comandos ESC/POS
// direto na string (ex.: "\x1B\x61\x01" centraliza; "\x1B\x61\x00" volta).
// ------------------------------------------------------------
export function montarCupom(pedido) {
  return [
    "\x1B\x61\x01" + "MINHA LOJA",        // centralizado
    "CNPJ 00.000.000/0001-00",
    "\x1B\x61\x00" + "--------------------------------", // alinhado à esquerda
    ...pedido.itens.map((i) => `${i.qtd}x ${i.nome}  R$ ${i.total}`),
    "--------------------------------",
    `TOTAL: R$ ${pedido.total}`,
    `Pedido #${pedido.id}`,
    new Date().toLocaleString("pt-BR"),
  ];
}

// ============================================================
// LOOP DE POLLING (switcher automático)
// Busca cupons pendentes NO SEU backend, imprime e marca como impresso.
// Ajuste as 2 URLs (/api/...) para as rotas reais do seu SaaS.
// ============================================================
let rodando = false;

async function cicloDeImpressao() {
  if (rodando) return;           // evita ciclos sobrepostos
  rodando = true;
  try {
    if (!(await bridgeOnline())) return; // bridge fechado: tenta no próximo ciclo

    const resp = await fetch("/api/cupons/pendentes");
    if (!resp.ok) return;
    const cupons = await resp.json(); // [{ id, itens, total, ... }]

    for (const cupom of cupons) {
      try {
        await imprimirCupom(montarCupom(cupom));
        // só marca como impresso se a impressão deu certo:
        await fetch(`/api/cupons/${cupom.id}/impresso`, { method: "POST" });
      } catch (err) {
        console.error("Falha ao imprimir cupom", cupom.id, err);
        // não marca -> reimprime no próximo ciclo
      }
    }
  } catch (err) {
    console.error("Erro no ciclo de impressão", err);
  } finally {
    rodando = false;
  }
}

// Inicia o polling (a cada 5s). Chame isto quando a tela do PDV abrir.
export function iniciarPolling(intervaloMs = 5000) {
  cicloDeImpressao();
  return setInterval(cicloDeImpressao, intervaloMs);
}
