import "server-only";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { getAgentAccount } from "../config";
import { getLiveWalletClient, getPublicClient, gasOptions } from "../celo/clients";
import { tagCalldata, verifyOnchainTag } from "../celo/attribution";
import { invalidateBalanceCache } from "../celo/balances";
import { preview, reasonEs, requestFirm, submitTx, type PreviewResult } from "../textile/client";
import { TOKENS, isFiat } from "../tokens";
import type { DB, RunMode, SwapPurpose, SwapRecord, TokenSymbol } from "../types";
import { newId, nowIso } from "../store";
import { shortAddress } from "../format";
import { fmt, units, type Logger } from "./common";

export interface ExecContext {
  db: DB;
  mode: RunMode;
  programId: string;
  cycleId?: string;
  log: Logger;
  maxSlippageBps: number;
}

const MAX_CHUNKS = 6;

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

export type TransferResult = { ok: true; txHash?: Hex; simulated: boolean } | { ok: false; error: string };

export async function transferToken(
  ctx: ExecContext,
  token: TokenSymbol,
  to: `0x${string}`,
  amount: bigint,
  label: string,
): Promise<TransferResult> {
  const info = TOKENS[token];
  if (ctx.mode === "dry_run") {
    const calldata = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    const tagged = tagCalldata(calldata);
    ctx.log.info(
      "pago",
      `${label}: transferencia simulada de ${fmt(amount, token)} a ${shortAddress(to)}`,
      `Armé la llamada transfer() al contrato ${info.display} con la etiqueta ERC-8021 al final (+${tagged.suffixBytes} bytes, ${
        tagged.verified ? "verificada" : "NO verificada"
      }${tagged.placeholder ? ", usando la etiqueta de prueba porque ATTRIBUTION_TAG está vacía" : ""}). No firmé ni envié nada.`,
    );
    return { ok: true, simulated: true };
  }
  try {
    const wallet = getLiveWalletClient();
    const hash = await wallet.writeContract({
      address: info.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [to, amount],
      ...gasOptions(),
    });
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash, timeout: 120_000 });
    invalidateBalanceCache();
    if (receipt.status !== "success") return { ok: false, error: `La transferencia ${hash} revirtió en la red.` };
    const tagged = await verifyOnchainTag(hash);
    ctx.log.ok(
      "pago",
      `${label}: envié ${fmt(amount, token)} a ${shortAddress(to)}`,
      tagged ? "Confirmada en Celo. Etiqueta ERC-8021 verificada en el calldata." : "Confirmada en Celo. Atención: no pude verificar la etiqueta ERC-8021.",
      hash,
    );
    return { ok: true, txHash: hash, simulated: false };
  } catch (e) {
    return { ok: false, error: cleanError(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Swaps via Textile                                                   */
/* ------------------------------------------------------------------ */

export interface SwapSpec {
  sell: TokenSymbol;
  buy: TokenSymbol;
  /** "buy" = exact output (we name what we receive); "sell" = exact input. */
  exact: "buy" | "sell";
  amount: bigint;
  purpose: SwapPurpose;
  /** Local units per USD₮ used as the fair-price reference for the slippage guard. */
  refRate?: number;
}

export interface PlannedChunk {
  request: bigint;
  sellAmount: bigint;
  buyAmount: bigint;
  feeAmount: bigint;
  takerPays: bigint;
}

export type SwapPlan =
  | { ok: true; spec: SwapSpec; chunks: PlannedChunk[]; sellTotal: bigint; buyTotal: bigint; feeTotal: bigint; rate: number }
  | { ok: false; spec: SwapSpec; code: "no_quote" | "no_corridor" | "error" | "slippage"; reason: string };

function usdtLeg(spec: SwapSpec, sellAmount: bigint, buyAmount: bigint): number {
  return spec.sell === "USDT" ? units(sellAmount, "USDT") : units(buyAmount, "USDT");
}

/** Local units per 1 USD₮ implied by a trade. */
export function rateOf(spec: SwapSpec, sellAmount: bigint, buyAmount: bigint): number {
  const local = isFiat(spec.sell) ? units(sellAmount, spec.sell) : units(buyAmount, spec.buy);
  const usd = usdtLeg(spec, sellAmount, buyAmount);
  return usd > 0 ? local / usd : 0;
}

function slippageBps(spec: SwapSpec, rate: number): number | undefined {
  if (!spec.refRate || !rate) return undefined;
  // Buying local: fewer local per dollar is worse. Selling local: more local per dollar is worse.
  return spec.sell === "USDT" ? ((spec.refRate - rate) / spec.refRate) * 10_000 : ((rate - spec.refRate) / spec.refRate) * 10_000;
}

function recordPreview(ctx: ExecContext, spec: SwapSpec, r: PreviewResult) {
  ctx.db.textile.previews += 1;
  if (r.status === "preview") ctx.db.textile.quotedNotionalUsdt += usdtLeg(spec, r.sellAmount, r.buyAmount);
  else ctx.db.textile.noQuotes += 1;
}

function sized(spec: SwapSpec, amount: bigint) {
  return spec.exact === "buy"
    ? { sell: spec.sell, buy: spec.buy, buyAmount: amount }
    : { sell: spec.sell, buy: spec.buy, sellAmount: amount };
}

/**
 * Prices a swap with Textile previews. If the full size gets no_quote but Textile
 * reports published depth, splits it into chunks under that depth (Textile never
 * fills partially, so one huge RFQ is the main no_quote risk).
 */
export async function planSwap(ctx: ExecContext, spec: SwapSpec): Promise<SwapPlan> {
  const first = await preview(sized(spec, spec.amount));
  recordPreview(ctx, spec, first);
  let chunks: PlannedChunk[] = [];
  if (first.status === "preview") {
    chunks = [{ request: spec.amount, ...pick(first) }];
  } else if (first.status === "unavailable") {
    return { ok: false, spec, code: first.reason === "corridor_unavailable" ? "no_corridor" : "error", reason: reasonEs(first.reason) };
  } else if (first.status === "error") {
    return { ok: false, spec, code: "error", reason: first.message };
  } else {
    const available = spec.exact === "buy" ? first.availableBuyAmount : first.availableSellAmount;
    if (!available || available <= 0n || available >= spec.amount) {
      return { ok: false, spec, code: "no_quote", reason: reasonEs(first.reason) };
    }
    const chunkSize = (available * 90n) / 100n;
    const n = Number((spec.amount + chunkSize - 1n) / chunkSize);
    if (n > MAX_CHUNKS) {
      return {
        ok: false,
        spec,
        code: "no_quote",
        reason: `${reasonEs(first.reason)}; harían falta ${n} órdenes partidas (máximo ${MAX_CHUNKS})`,
      };
    }
    let remaining = spec.amount;
    while (remaining > 0n) {
      const size = remaining < chunkSize ? remaining : chunkSize;
      const p = await preview(sized(spec, size));
      recordPreview(ctx, spec, p);
      if (p.status !== "preview") {
        return { ok: false, spec, code: "no_quote", reason: `una de las órdenes partidas no consiguió cotización` };
      }
      chunks.push({ request: size, ...pick(p) });
      remaining -= size;
    }
  }
  const sellTotal = chunks.reduce((a, c) => a + c.takerPays, 0n);
  const buyTotal = chunks.reduce((a, c) => a + c.buyAmount, 0n);
  const feeTotal = chunks.reduce((a, c) => a + c.feeAmount, 0n);
  const rate = rateOf(spec, sellTotal, buyTotal);
  const slip = slippageBps(spec, rate);
  if (slip !== undefined && slip > ctx.maxSlippageBps) {
    return {
      ok: false,
      spec,
      code: "slippage",
      reason: `el precio está ${slip.toFixed(0)} pb peor que la referencia (límite ${ctx.maxSlippageBps} pb)`,
    };
  }
  return { ok: true, spec, chunks, sellTotal, buyTotal, feeTotal, rate };
}

function pick(p: Extract<PreviewResult, { status: "preview" }>) {
  return { sellAmount: p.sellAmount, buyAmount: p.buyAmount, feeAmount: p.feeAmount, takerPays: p.takerPays };
}

export type SwapExecResult =
  | { ok: true; record: SwapRecord; sellTotal: bigint; buyTotal: bigint }
  | { ok: false; error: string; partial?: { sellTotal: bigint; buyTotal: bigint; record?: SwapRecord } };

function makeRecord(
  ctx: ExecContext,
  spec: SwapSpec,
  sellTotal: bigint,
  buyTotal: bigint,
  feeTotal: bigint,
  chunks: number,
  kind: "preview" | "firm",
  rfqIds: string[],
  txHashes: string[],
): SwapRecord {
  return {
    id: newId("swp"),
    programId: ctx.programId,
    cycleId: ctx.cycleId,
    purpose: spec.purpose,
    sellToken: spec.sell,
    buyToken: spec.buy,
    sellAmount: String(units(sellTotal, spec.sell)),
    buyAmount: String(units(buyTotal, spec.buy)),
    feeAmount: String(units(feeTotal, spec.sell)),
    rate: rateOf(spec, sellTotal, buyTotal),
    chunks,
    quoteKind: kind,
    simulated: ctx.mode === "dry_run",
    rfqIds,
    txHashes,
    at: nowIso(),
  };
}

/** Executes a priced plan: nothing to sign in DRY_RUN; firm RFQ + approve + swap in live mode. */
export async function executeSwap(ctx: ExecContext, plan: Extract<SwapPlan, { ok: true }>): Promise<SwapExecResult> {
  const { spec } = plan;
  if (ctx.mode === "dry_run") {
    const record = makeRecord(ctx, spec, plan.sellTotal, plan.buyTotal, plan.feeTotal, plan.chunks.length, "preview", [], []);
    ctx.db.swaps.push(record);
    ctx.db.textile.feesUsdt += spec.sell === "USDT" ? units(plan.feeTotal, "USDT") : 0;
    return { ok: true, record, sellTotal: plan.sellTotal, buyTotal: plan.buyTotal };
  }

  const wallet = getLiveWalletClient();
  const account = getAgentAccount();
  const pub = getPublicClient();
  const sellInfo = TOKENS[spec.sell];
  let sellTotal = 0n;
  let buyTotal = 0n;
  let feeTotal = 0n;
  const rfqIds: string[] = [];
  const txHashes: string[] = [];

  const signProof = ({ taker, nonce, issuedAt }: { taker: `0x${string}`; nonce: Hex; issuedAt: number }) =>
    account.signTypedData({
      domain: { name: "Textile Taker Control", version: "1", chainId: 42220 },
      types: {
        TakerControl: [
          { name: "taker", type: "address" },
          { name: "chainId", type: "uint256" },
          { name: "nonce", type: "bytes32" },
          { name: "issuedAt", type: "uint256" },
        ],
      },
      primaryType: "TakerControl",
      message: { taker, chainId: 42220n, nonce, issuedAt: BigInt(issuedAt) },
    });

  const partial = (error: string): SwapExecResult => {
    if (sellTotal === 0n) return { ok: false, error };
    const record = makeRecord(ctx, spec, sellTotal, buyTotal, feeTotal, rfqIds.length, "firm", rfqIds, txHashes);
    ctx.db.swaps.push(record);
    return { ok: false, error, partial: { sellTotal, buyTotal, record } };
  };

  try {
    for (const chunk of plan.chunks) {
      let firm = await requestFirm(sized(spec, chunk.request), account.address, signProof);
      ctx.db.textile.firmQuotes += 1;
      if (firm.status === "no_quote" && firm.retryAfterMs && firm.retryAfterMs <= 5_000) {
        const waitMs = firm.retryAfterMs;
        await new Promise((r) => setTimeout(r, waitMs));
        firm = await requestFirm(sized(spec, chunk.request), account.address, signProof);
        ctx.db.textile.firmQuotes += 1;
      }
      if (firm.status !== "quoted") {
        if (firm.status === "no_quote") ctx.db.textile.noQuotes += 1;
        return partial(firm.status === "error" ? firm.message : `Textile no dio cotización firme: ${reasonEs(firm.reason)}`);
      }
      const rate = rateOf(spec, firm.takerPays, firm.buyAmount);
      const slip = slippageBps(spec, rate);
      if (slip !== undefined && slip > ctx.maxSlippageBps) {
        return partial(`La cotización firme quedó ${slip.toFixed(0)} pb peor que la referencia; no la acepté.`);
      }

      const allowance = await pub.readContract({
        address: sellInfo.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, firm.reactor],
      });
      if (allowance < firm.takerPays) {
        if (allowance > 0n) {
          const reset = await wallet.writeContract({
            address: sellInfo.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [firm.reactor, 0n],
            ...gasOptions(),
          });
          await pub.waitForTransactionReceipt({ hash: reset, timeout: 120_000 });
          txHashes.push(reset);
        }
        const approval = await wallet.writeContract({
          address: sellInfo.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [firm.reactor, firm.takerPays],
          ...gasOptions(),
        });
        const ar = await pub.waitForTransactionReceipt({ hash: approval, timeout: 120_000 });
        txHashes.push(approval);
        if (ar.status !== "success") return partial("La aprobación del token revirtió.");
        ctx.log.info("cambio", `Autoricé a Textile a usar exactamente ${fmt(firm.takerPays, spec.sell)}`, "Aprobación exacta (no ilimitada), con etiqueta ERC-8021.", approval);
      }

      if (Date.now() >= Date.parse(firm.expiresAt)) {
        return partial("La cotización venció mientras se confirmaba la aprobación; no envié el cambio.");
      }

      const hash = await wallet.sendTransaction({
        to: firm.swap.to,
        data: firm.swap.data,
        value: 0n,
        ...gasOptions(),
      });
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
      txHashes.push(hash);
      rfqIds.push(firm.rfqId);
      void submitTx(firm.rfqId, firm.claimToken, hash);
      if (receipt.status !== "success") return partial(`El cambio ${hash} revirtió en la red.`);
      sellTotal += firm.takerPays;
      buyTotal += firm.buyAmount;
      feeTotal += firm.feeAmount;
      ctx.db.textile.fills += 1;
      ctx.db.textile.filledNotionalUsdt += usdtLeg(spec, firm.takerPays, firm.buyAmount);
      if (spec.sell === "USDT") ctx.db.textile.feesUsdt += units(firm.feeAmount, "USDT");
      const tagged = await verifyOnchainTag(hash);
      ctx.log.ok(
        "cambio",
        `Cambio ejecutado: ${fmt(firm.takerPays, spec.sell)} → ${fmt(firm.buyAmount, spec.buy)}`,
        `Textile RFQ ${firm.rfqId}. ${tagged ? "Etiqueta ERC-8021 verificada." : "Atención: no pude verificar la etiqueta ERC-8021."}`,
        hash,
      );
    }
    invalidateBalanceCache();
    const record = makeRecord(ctx, spec, sellTotal, buyTotal, feeTotal, plan.chunks.length, "firm", rfqIds, txHashes);
    ctx.db.swaps.push(record);
    return { ok: true, record, sellTotal, buyTotal };
  } catch (e) {
    invalidateBalanceCache();
    return partial(cleanError(e));
  }
}

/** viem errors can be long; keep the first line and never echo request bodies. */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage ?? e.message : String(e);
  return msg.split("\n")[0].slice(0, 300);
}
