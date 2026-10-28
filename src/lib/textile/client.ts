import "server-only";
import crypto from "node:crypto";
import { toHex, type Hex } from "viem";
import { getConfig, getTextileApiKey } from "../config";
import { CELO_CHAIN_ID, TOKENS, tokenByAddress } from "../tokens";
import type { TokenSymbol } from "../types";

export interface TextileLevel {
  sellAmount: bigint;
  buyAmount: bigint;
}

export interface TextilePair {
  sell: TokenSymbol;
  buy: TokenSymbol;
  sellDecimals: number;
  buyDecimals: number;
  minSellAmount: bigint;
  maxSellAmount: bigint;
  levels: TextileLevel[];
}

export interface TextileLevels {
  asOf: string;
  pairs: TextilePair[];
}

export type PreviewResult =
  | {
      status: "preview";
      sellAmount: bigint;
      buyAmount: bigint;
      feeAmount: bigint;
      takerPays: bigint;
      availableBuyAmount?: bigint;
      availableSellAmount?: bigint;
    }
  | {
      status: "no_quote";
      reason: string;
      availableBuyAmount?: bigint;
      availableSellAmount?: bigint;
      retryAfterMs?: number;
    }
  | { status: "unavailable"; reason: string; message: string }
  | { status: "error"; message: string };

export interface SwapRequest {
  sell: TokenSymbol;
  buy: TokenSymbol;
  sellAmount?: bigint;
  buyAmount?: bigint;
}

const big = (v: unknown): bigint | undefined => {
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  return undefined;
};

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const key = getTextileApiKey();
  if (key) h.Authorization = `Bearer ${key}`;
  return h;
}

const g = globalThis as unknown as { __becapayLevels?: { at: number; value: TextileLevels } };

export async function getLevels(maxAgeMs = 20_000): Promise<TextileLevels> {
  const cached = g.__becapayLevels;
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.value;
  const res = await fetch(`${getConfig().textileApi}/rfq/levels?chainId=${CELO_CHAIN_ID}`, {
    headers: headers(),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Textile respondió ${res.status} al pedir niveles de liquidez.`);
  const json = (await res.json()) as {
    data: {
      asOf: string;
      pairs: {
        sellToken: string;
        buyToken: string;
        sellDecimals: number;
        buyDecimals: number;
        minSellAmount: string;
        maxSellAmount: string;
        levels: { sellAmount: string; buyAmount: string }[];
      }[];
    };
  };
  const pairs: TextilePair[] = [];
  for (const p of json.data.pairs) {
    const sell = tokenByAddress(p.sellToken);
    const buy = tokenByAddress(p.buyToken);
    if (!sell || !buy) continue;
    pairs.push({
      sell: sell.symbol,
      buy: buy.symbol,
      sellDecimals: p.sellDecimals,
      buyDecimals: p.buyDecimals,
      minSellAmount: BigInt(p.minSellAmount),
      maxSellAmount: BigInt(p.maxSellAmount),
      levels: p.levels.map((l) => ({ sellAmount: BigInt(l.sellAmount), buyAmount: BigInt(l.buyAmount) })),
    });
  }
  const value = { asOf: json.data.asOf, pairs };
  g.__becapayLevels = { at: Date.now(), value };
  return value;
}

function body(req: SwapRequest): Record<string, unknown> {
  const b: Record<string, unknown> = {
    chainId: CELO_CHAIN_ID,
    sellToken: TOKENS[req.sell].address,
    buyToken: TOKENS[req.buy].address,
  };
  if (req.buyAmount !== undefined) b.buyAmount = req.buyAmount.toString();
  else if (req.sellAmount !== undefined) b.sellAmount = req.sellAmount.toString();
  return b;
}

/** Free, indicative price. Never signs, never reserves liquidity. */
export async function preview(req: SwapRequest): Promise<PreviewResult> {
  try {
    const res = await fetch(`${getConfig().textileApi}/rfq/preview`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body(req)),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string; details?: { reason?: string } };
    };
    if (!res.ok) {
      const reason = json.error?.details?.reason ?? json.error?.code ?? `http_${res.status}`;
      return {
        status: "unavailable",
        reason,
        message: json.error?.message ?? `Textile respondió ${res.status}.`,
      };
    }
    const d = json.data ?? {};
    if (d.status === "preview") {
      return {
        status: "preview",
        sellAmount: big(d.sellAmount) ?? 0n,
        buyAmount: big(d.buyAmount) ?? 0n,
        feeAmount: big(d.feeAmount) ?? 0n,
        takerPays: big(d.takerPays) ?? big(d.sellAmount) ?? 0n,
        availableBuyAmount: big(d.availableBuyAmount),
        availableSellAmount: big(d.availableSellAmount),
      };
    }
    return {
      status: "no_quote",
      reason: typeof d.reason === "string" ? d.reason : "no_quote",
      availableBuyAmount: big(d.availableBuyAmount),
      availableSellAmount: big(d.availableSellAmount),
      retryAfterMs: typeof d.retryAfterMs === "number" ? d.retryAfterMs : undefined,
    };
  } catch (e) {
    return { status: "error", message: `No pude contactar a Textile: ${(e as Error).message}` };
  }
}

export interface FirmQuote {
  status: "quoted";
  rfqId: string;
  claimToken: string;
  sellAmount: bigint;
  buyAmount: bigint;
  feeAmount: bigint;
  takerPays: bigint;
  reactor: `0x${string}`;
  expiresAt: string;
  swap: { to: `0x${string}`; data: Hex; value: bigint };
}

export type FirmResult =
  | FirmQuote
  | { status: "no_quote"; reason: string; rfqId?: string; claimToken?: string; retryAfterMs?: number; availableBuyAmount?: bigint; availableSellAmount?: bigint }
  | { status: "error"; message: string };

export type TakerProofSigner = (args: { taker: `0x${string}`; nonce: Hex; issuedAt: number }) => Promise<Hex>;

/**
 * Firm, executable quote (live mode only). Without a partner key Textile asks for
 * proof of control on the first request: an EIP-712 signature by the taker wallet.
 */
export async function requestFirm(
  req: SwapRequest,
  taker: `0x${string}`,
  signProof: TakerProofSigner,
): Promise<FirmResult> {
  const send = async (extra: Record<string, unknown> = {}) =>
    fetch(`${getConfig().textileApi}/rfq/request`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ ...body(req), taker, ...extra }),
      cache: "no-store",
      signal: AbortSignal.timeout(75_000),
    });
  try {
    let res = await send();
    if (res.status === 401 && !getTextileApiKey()) {
      const err = (await res.clone().json().catch(() => ({}))) as { error?: { details?: { reason?: string } } };
      if (err.error?.details?.reason === "proof_of_control_required") {
        const nonce = toHex(crypto.randomBytes(32));
        const issuedAt = Date.now();
        const signature = await signProof({ taker, nonce, issuedAt });
        res = await send({ takerProof: { nonce, issuedAt, signature } });
      }
    }
    const json = (await res.json().catch(() => ({}))) as {
      data?: Record<string, unknown> & {
        quote?: Record<string, unknown>;
        transactions?: { swap?: { to: string; data: string; value: string } };
      };
      error?: { message?: string };
    };
    if (!res.ok) return { status: "error", message: json.error?.message ?? `Textile respondió ${res.status}.` };
    const d = json.data ?? {};
    if (d.status !== "quoted" || !d.quote || !d.transactions?.swap) {
      return {
        status: "no_quote",
        reason: typeof d.reason === "string" ? d.reason : "no_quote",
        rfqId: d.rfqId as string | undefined,
        claimToken: d.claimToken as string | undefined,
        retryAfterMs: typeof d.retryAfterMs === "number" ? d.retryAfterMs : undefined,
        availableBuyAmount: big(d.availableBuyAmount),
        availableSellAmount: big(d.availableSellAmount),
      };
    }
    const q = d.quote;
    const swap = d.transactions.swap;
    return {
      status: "quoted",
      rfqId: d.rfqId as string,
      claimToken: d.claimToken as string,
      sellAmount: big(q.sellAmount) ?? 0n,
      buyAmount: big(q.buyAmount) ?? 0n,
      feeAmount: big(q.feeAmount) ?? 0n,
      takerPays: big(q.takerPays) ?? 0n,
      reactor: q.reactor as `0x${string}`,
      expiresAt: q.expiresAt as string,
      swap: { to: swap.to as `0x${string}`, data: swap.data as Hex, value: BigInt(swap.value ?? "0") },
    };
  } catch (e) {
    return { status: "error", message: `No pude pedir la cotización firme a Textile: ${(e as Error).message}` };
  }
}

/** Courtesy report of the broadcast hash; settlement is reconciled on-chain regardless. */
export async function submitTx(rfqId: string, claimToken: string, txHash: Hex): Promise<void> {
  const h = headers();
  h["X-Rfq-Claim"] = claimToken;
  await fetch(`${getConfig().textileApi}/rfq/${rfqId}/submit`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ txHash }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
}

export const NO_QUOTE_REASON_ES: Record<string, string> = {
  no_makers_online: "no hay creadores de mercado conectados para este par",
  no_valid_quote: "ningún creador de mercado cotizó ese tamaño a tiempo",
  no_restricted_liquidity: "los creadores de mercado elegidos no pudieron cotizar",
  corridor_unavailable: "Textile no tiene corredor para este par en Celo",
  no_quote: "Textile no devolvió cotización",
};

export function reasonEs(reason: string): string {
  return NO_QUOTE_REASON_ES[reason] ?? reason;
}
