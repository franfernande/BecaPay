import "server-only";
import { formatUnits } from "viem";
import { FIAT_SYMBOLS, TOKENS } from "../tokens";
import type { CurrencyLiquidity, FiatSymbol, LiquidityStatus } from "../types";
import { formatNumber } from "../format";
import type { TextileLevels, TextilePair } from "./client";

const toNum = (v: bigint, decimals: number) => Number(formatUnits(v, decimals));

export function findPair(levels: TextileLevels | undefined, sell: string, buy: string): TextilePair | undefined {
  return levels?.pairs.find((p) => p.sell === sell && p.buy === buy);
}

/** Local units per 1 USD₮, from the smallest published level on each side. */
export function textileMidRate(levels: TextileLevels | undefined, token: FiatSymbol): number | undefined {
  const rates: number[] = [];
  const sellLocal = findPair(levels, token, "USDT");
  const l1 = sellLocal?.levels[0];
  if (sellLocal && l1 && l1.buyAmount > 0n) {
    rates.push(toNum(l1.sellAmount, sellLocal.sellDecimals) / toNum(l1.buyAmount, sellLocal.buyDecimals));
  }
  const buyLocal = findPair(levels, "USDT", token);
  const l2 = buyLocal?.levels[0];
  if (buyLocal && l2 && l2.sellAmount > 0n) {
    rates.push(toNum(l2.buyAmount, buyLocal.buyDecimals) / toNum(l2.sellAmount, buyLocal.sellDecimals));
  }
  if (rates.length === 0) return undefined;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

export function payoutDepth(levels: TextileLevels | undefined, token: FiatSymbol) {
  const pair = findPair(levels, "USDT", token);
  if (!pair) return undefined;
  const last = pair.levels.at(-1);
  return {
    usdt: toNum(pair.maxSellAmount, pair.sellDecimals),
    local: last ? toNum(last.buyAmount, pair.buyDecimals) : 0,
  };
}

export function fundingDepth(levels: TextileLevels | undefined, token: FiatSymbol) {
  const pair = findPair(levels, token, "USDT");
  if (!pair) return undefined;
  const last = pair.levels.at(-1);
  return {
    local: toNum(pair.maxSellAmount, pair.sellDecimals),
    usdt: last ? toNum(last.buyAmount, pair.buyDecimals) : 0,
  };
}

/**
 * Classifies a currency for a given cycle need:
 * - ok: total need ≤ 60% of published payout depth
 * - fragile: each student fits, but the month together is tight → per-student trades / splits
 * - no_quote: no payout depth, or a single payment exceeds the depth
 * - no_corridor: Textile has no pair on Celo
 */
export function analyzeCurrency(
  levels: TextileLevels | undefined,
  token: FiatSymbol,
  needLocal: number,
  largestSingleLocal: number,
  students: number,
): CurrencyLiquidity {
  const base = { token, needLocal, largestSingleLocal, students };
  const midRate = textileMidRate(levels, token);
  const payout = payoutDepth(levels, token);
  const funding = fundingDepth(levels, token);
  const sym = TOKENS[token].display;
  if (!levels) {
    return { ...base, status: "unknown", note: "No pude leer la liquidez de Textile en este momento." };
  }
  if (!payout && !funding) {
    return {
      ...base,
      status: "no_corridor",
      note: `Textile no tiene corredor ${sym} ↔ USD₮ en Celo. Los pagos en ${sym} se hacen en USD₮ (respaldo).`,
    };
  }
  const extra = { midRate, payoutDepthLocal: payout?.local, payoutDepthUsdt: payout?.usdt, fundingDepthLocal: funding?.local };
  if (!payout || payout.local <= 0) {
    return {
      ...base,
      ...extra,
      status: "no_quote",
      note: `Hoy nadie vende ${sym} por USD₮ en Textile (profundidad de pago 0). Se paga en USD₮ y se avisa a la fundación.`,
    };
  }
  let status: LiquidityStatus;
  let note: string;
  if (needLocal <= payout.local * 0.6) {
    status = "ok";
    note = `Hay ~${formatNumber(payout.local, 0)} ${sym} publicados; este ciclo necesita ${formatNumber(needLocal, 0)}.`;
  } else if (largestSingleLocal <= payout.local) {
    status = "fragile";
    note = `Liquidez justa (~${formatNumber(payout.local, 0)} ${sym} publicados). El agente cambia por becario y parte órdenes si hace falta.`;
  } else {
    status = "no_quote";
    note = `Un solo pago (${formatNumber(largestSingleLocal, 0)} ${sym}) supera la profundidad publicada (~${formatNumber(payout.local, 0)}).`;
  }
  return { ...base, ...extra, status, note };
}

const g = globalThis as unknown as { __becapayRefFx?: { at: number; rates: Record<string, number> } };

/** Public reference FX (only when Textile has no price for a currency). */
async function referenceFx(): Promise<Record<string, number>> {
  const cached = g.__becapayRefFx;
  if (cached && Date.now() - cached.at < 3_600_000) return cached.rates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rates = json.rates ?? {};
    g.__becapayRefFx = { at: Date.now(), rates };
    return rates;
  } catch {
    return cached?.rates ?? {};
  }
}

export interface RateInfo {
  rate: number;
  source: "textile" | "referencia";
}

export type Rates = Partial<Record<FiatSymbol, RateInfo>>;

export async function getRates(levels: TextileLevels | undefined): Promise<Rates> {
  const rates: Rates = {};
  const missing: FiatSymbol[] = [];
  for (const s of FIAT_SYMBOLS) {
    const r = textileMidRate(levels, s);
    if (r && Number.isFinite(r)) rates[s] = { rate: r, source: "textile" };
    else missing.push(s);
  }
  if (missing.length) {
    const fx = await referenceFx();
    for (const s of missing) {
      const fiat = TOKENS[s].fiat;
      const r = fiat ? fx[fiat] : undefined;
      if (r && Number.isFinite(r)) rates[s] = { rate: r, source: "referencia" };
    }
  }
  return rates;
}

export function toUsdt(amount: number, token: string, rates: Rates): number | undefined {
  if (token === "USDT") return amount;
  const r = rates[token as FiatSymbol]?.rate;
  return r ? amount / r : undefined;
}
