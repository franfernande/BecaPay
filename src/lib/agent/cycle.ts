import "server-only";
import { parseUnits } from "viem";
import { checkLiveReadiness, getConfig } from "../config";
import { getPublicClient } from "../celo/clients";
import { readOnchainBalances } from "../celo/balances";
import { getLevels, type TextileLevels } from "../textile/client";
import { analyzeCurrency, getRates, type Rates } from "../textile/liquidity";
import { CELO_CHAIN_ID, FIAT_SYMBOLS, TOKENS, rampUrl } from "../tokens";
import { formatDate, formatNumber, formatToken, formatUsd } from "../format";
import { newId, nowIso, readDB, withLock, writeDB } from "../store";
import type {
  Cycle,
  DB,
  FiatSymbol,
  LiquidityCheck,
  Payment,
  Program,
  RunMode,
  Student,
  TokenSymbol,
} from "../types";
import {
  advanceDate,
  atomic,
  balancesToLedger,
  describeBalances,
  effectiveCoverage,
  fmt,
  ledgerToBalances,
  makeLogger,
  perCycleUsdt,
  raiseAlert,
  resolveAlerts,
  units,
  valueUsdt,
  zeroBalances,
  type Balances,
  type Logger,
} from "./common";
import { executeSwap, planSwap, transferToken, cleanError, type ExecContext, type SwapSpec } from "./executor";

const MIN_HEDGE_USDT = 5;

export interface ActionResult {
  ok: boolean;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Treasury                                                            */
/* ------------------------------------------------------------------ */

async function loadTreasury(db: DB, program: Program, mode: RunMode): Promise<{ balances: Balances; error?: string }> {
  if (mode === "dry_run") return { balances: ledgerToBalances(db, program.id) };
  const onchain = await readOnchainBalances(getConfig().agentWallet, 0);
  if (!onchain.ok) return { balances: zeroBalances(), error: onchain.error };
  const b = zeroBalances();
  for (const [s, v] of Object.entries(onchain.tokens)) b[s as TokenSymbol] = v ?? 0n;
  return { balances: b };
}

function persistTreasury(db: DB, program: Program, mode: RunMode, b: Balances) {
  if (mode === "dry_run") db.ledger[program.id] = balancesToLedger(b);
}

/* ------------------------------------------------------------------ */
/* Liquidity pre-check                                                 */
/* ------------------------------------------------------------------ */

export function buildPrecheck(levels: TextileLevels | undefined, students: Student[], error?: string): LiquidityCheck {
  const active = students.filter((s) => s.active);
  const currencies = FIAT_SYMBOLS.filter((c) => active.some((s) => s.currency === c)).map((c) => {
    const group = active.filter((s) => s.currency === c);
    const amounts = group.map((s) => Number(s.amount));
    return analyzeCurrency(levels, c, amounts.reduce((a, b) => a + b, 0), Math.max(0, ...amounts), group.length);
  });
  return {
    at: nowIso(),
    asOf: levels?.asOf,
    ok: !error && currencies.every((c) => c.status === "ok" || c.status === "fragile"),
    currencies,
    error,
  };
}

const STATUS_ES: Record<string, string> = {
  ok: "OK",
  fragile: "frágil",
  no_quote: "sin cotización",
  no_corridor: "sin corredor",
  unknown: "desconocido",
};

function logPrecheck(log: Logger, check: LiquidityCheck) {
  if (check.error) {
    log.warn("liquidez", "No pude leer la liquidez de Textile", `${check.error} Sigo con la caja disponible y aplico la regla de respaldo si no hay cotización.`);
    return;
  }
  for (const c of check.currencies) {
    const title = `Liquidez ${TOKENS[c.token].display}: ${STATUS_ES[c.status]}`;
    if (c.status === "ok") log.ok("liquidez", title, c.note);
    else log.warn("liquidez", title, c.note);
  }
}

async function fetchLevels(): Promise<{ levels?: TextileLevels; error?: string }> {
  try {
    return { levels: await getLevels(0) };
  } catch (e) {
    return { error: cleanError(e) };
  }
}

export async function runPrecheck(programId: string): Promise<ActionResult & { check?: LiquidityCheck }> {
  const { levels, error } = await fetchLevels();
  return withLock(async () => {
    const db = readDB();
    const program = db.programs.find((p) => p.id === programId);
    if (!program) return { ok: false, message: "Programa no encontrado." };
    const mode: RunMode = getConfig().dryRun ? "dry_run" : "live";
    const log = makeLogger(db, program.id, undefined, mode);
    const check = buildPrecheck(levels, db.students.filter((s) => s.programId === programId), error);
    db.prechecks[programId] = check;
    log.info("liquidez", "Pre-chequeo de liquidez en Textile", `Consulté niveles publicados (GET /v2/rfq/levels) para las monedas del programa.`);
    logPrecheck(log, check);
    for (const c of check.currencies) {
      if (c.status === "no_quote" || c.status === "no_corridor") {
        raiseAlert(db, {
          programId,
          kind: "liquidity",
          severity: "warning",
          token: c.token,
          title: `Sin liquidez de pago en ${TOKENS[c.token].display}`,
          message: `${c.note} Los becarios en ${TOKENS[c.token].display} cobrarán en USD₮ hasta que vuelva la liquidez.`,
        });
      }
    }
    writeDB(db);
    return { ok: true, message: check.ok ? "Liquidez OK para el próximo ciclo." : "Hay monedas con liquidez frágil o sin cotización.", check };
  });
}

/* ------------------------------------------------------------------ */
/* Cycle                                                               */
/* ------------------------------------------------------------------ */

interface CycleCtx extends ExecContext {
  program: Program;
  students: Student[];
  bal: Balances;
  rates: Rates;
  spentUsdt: bigint;
  capUsdt: bigint;
  /** Local amounts still owed this cycle to students not yet processed. */
  pendingNeed: Partial<Record<FiatSymbol, bigint>>;
}

export async function runCycle(programId: string, trigger: "manual" | "scheduled"): Promise<ActionResult> {
  return withLock(async () => {
    const db = readDB();
    const cfg = getConfig();
    const mode: RunMode = cfg.dryRun ? "dry_run" : "live";
    const program = db.programs.find((p) => p.id === programId);
    if (!program) return { ok: false, message: "Programa no encontrado." };
    const students = db.students.filter((s) => s.programId === programId && s.active);
    const log0 = makeLogger(db, program.id, undefined, mode);

    if (program.cyclesCompleted >= program.cyclesPlanned) {
      return { ok: false, message: "El programa ya completó todos sus ciclos planificados." };
    }
    if (students.length === 0) {
      return { ok: false, message: "No hay becarios activos en este programa." };
    }
    if (mode === "live") {
      const readiness = checkLiveReadiness();
      if (!readiness.ready) {
        log0.error("seguridad", "Ciclo bloqueado: el modo en vivo no está listo", readiness.problems.join(" "));
        raiseAlert(db, { programId, kind: "config", severity: "critical", title: "Configuración incompleta", message: readiness.problems.join(" ") });
        writeDB(db);
        return { ok: false, message: readiness.problems.join(" ") };
      }
      try {
        const chainId = await getPublicClient().getChainId();
        if (chainId !== CELO_CHAIN_ID) {
          log0.error("seguridad", `Ciclo bloqueado: la red responde chainId ${chainId}`, "Solo opero en Celo mainnet (42220).");
          writeDB(db);
          return { ok: false, message: `La red no es Celo mainnet (chainId ${chainId}).` };
        }
      } catch (e) {
        return { ok: false, message: `No pude contactar la red Celo: ${cleanError(e)}` };
      }
    }

    const cycle: Cycle = {
      id: newId("cyc"),
      programId,
      period: program.nextCycleAt,
      trigger,
      mode,
      status: "running",
      startedAt: nowIso(),
      paymentIds: [],
    };
    db.cycles.push(cycle);
    const log = makeLogger(db, program.id, cycle.id, mode);
    log.info(
      "ciclo",
      `Ciclo ${program.cyclesCompleted + 1} de ${program.cyclesPlanned} iniciado (${trigger === "manual" ? "botón «Correr ciclo»" : "fecha programada"})`,
      mode === "dry_run"
        ? `Período ${formatDate(cycle.period)}. Modo simulación: uso cotizaciones reales de Textile, pero no firmo ni envío transacciones.`
        : `Período ${formatDate(cycle.period)}. Modo en vivo en Celo mainnet (42220): cada transacción lleva la etiqueta ERC-8021.`,
    );

    // 1. Liquidity pre-check
    const { levels, error: levelsError } = await fetchLevels();
    const rates = await getRates(levels);
    cycle.precheck = buildPrecheck(levels, students, levelsError);
    db.prechecks[programId] = cycle.precheck;
    logPrecheck(log, cycle.precheck);

    // 2. Treasury
    const treasury = await loadTreasury(db, program, mode);
    if (treasury.error) {
      cycle.status = "failed";
      cycle.finishedAt = nowIso();
      cycle.summary = treasury.error;
      log.error("fondeo", "No pude leer la caja del agente", treasury.error);
      writeDB(db);
      return { ok: false, message: treasury.error };
    }
    const bal = treasury.balances;
    log.info(
      "fondeo",
      mode === "dry_run" ? "Caja simulada al inicio del ciclo" : "Caja on-chain al inicio del ciclo",
      `${describeBalances(bal)} (≈ ${formatUsd(valueUsdt(bal, rates).total)}).`,
    );
    writeDB(db);

    const pendingNeed: Partial<Record<FiatSymbol, bigint>> = {};
    for (const s of students) pendingNeed[s.currency] = (pendingNeed[s.currency] ?? 0n) + atomic(s.amount, s.currency);

    const ctx: CycleCtx = {
      db,
      mode,
      programId,
      cycleId: cycle.id,
      log,
      maxSlippageBps: cfg.maxSlippageBps,
      program,
      students,
      bal,
      rates,
      spentUsdt: 0n,
      capUsdt: parseUnits(String(cfg.maxUsdtPerCycle), 6),
      pendingNeed,
    };

    // 3. One payment per student (never one giant RFQ for the whole month)
    for (const s of students) {
      let payment: Payment;
      try {
        payment = await payStudent(ctx, s);
      } catch (e) {
        payment = basePayment(ctx, s, { status: "failed", source: "local_balance", reason: cleanError(e) });
        log.error("pago", `${s.publicId}: error inesperado`, cleanError(e));
      }
      pendingNeed[s.currency] = (pendingNeed[s.currency] ?? 0n) - atomic(s.amount, s.currency);
      db.payments.push(payment);
      cycle.paymentIds.push(payment.id);
      persistTreasury(db, program, mode, bal);
      writeDB(db);
    }

    // 4. Protect idle cash in USD₮ (if the toggle is on)
    try {
      await protectIdle(ctx, program.cyclesCompleted + 1);
    } catch (e) {
      log.warn("cobertura", "No pude proteger el excedente", cleanError(e));
    }

    // 5. Close
    const payments = db.payments.filter((p) => p.cycleId === cycle.id);
    const paid = payments.filter((p) => p.status === "paid").length;
    const fallback = payments.filter((p) => p.status === "fallback").length;
    const failed = payments.filter((p) => p.status === "failed").length;
    const skipped = payments.filter((p) => p.status === "skipped").length;
    cycle.status = failed === 0 ? "completed" : paid + fallback > 0 ? "partial" : "failed";
    cycle.finishedAt = nowIso();

    if (cycle.status !== "failed") {
      program.cyclesCompleted += 1;
      program.nextCycleAt = advanceDate(cycle.period, program.frequency);
      if (program.nextCycleAt < nowIso()) program.nextCycleAt = advanceDate(nowIso(), program.frequency);
    }
    persistTreasury(db, program, mode, bal);
    checkCoverage(ctx);

    const parts = [`${paid} en moneda local`];
    if (fallback) parts.push(`${fallback} en USD₮ de respaldo`);
    if (failed) parts.push(`${failed} sin pagar`);
    if (skipped) parts.push(`${skipped} omitidos`);
    cycle.summary = `${paid + fallback} de ${payments.length} becarios cobraron (${parts.join(", ")}).`;
    const next = cycle.status !== "failed" ? ` Próximo ciclo: ${formatDate(program.nextCycleAt)}.` : "";
    if (cycle.status === "completed") log.ok("ciclo", "Ciclo completado", `${cycle.summary}${next}`);
    else if (cycle.status === "partial") log.warn("ciclo", "Ciclo completado con pendientes", `${cycle.summary}${next}`);
    else log.error("ciclo", "Ciclo fallido", `${cycle.summary} No avancé la fecha: el período sigue pendiente.`);
    writeDB(db);
    return { ok: cycle.status !== "failed", message: cycle.summary };
  });
}

function basePayment(
  ctx: CycleCtx,
  s: Student,
  extra: Partial<Payment> & Pick<Payment, "status" | "source">,
): Payment {
  return {
    id: newId("pay"),
    cycleId: ctx.cycleId!,
    programId: ctx.programId,
    studentId: s.id,
    studentPublicId: s.publicId,
    wallet: s.wallet,
    requestedToken: s.currency,
    requestedAmount: s.amount,
    paidToken: s.currency,
    paidAmount: "0",
    simulated: ctx.mode === "dry_run",
    at: nowIso(),
    ...extra,
  };
}

async function payStudent(ctx: CycleCtx, s: Student): Promise<Payment> {
  const { bal, log } = ctx;
  const C = s.currency;
  const need = atomic(s.amount, C);
  const label = s.publicId;

  if (ctx.mode === "live" && s.demo) {
    log.warn("pago", `${label}: omitido`, "Es un becario de demostración: en modo en vivo nunca le envío dinero.");
    return basePayment(ctx, s, { status: "skipped", source: "local_balance", reason: "Becario de demostración" });
  }

  // a) The treasury already holds the student's currency.
  if (bal[C] >= need) {
    log.info("pago", `${label}: pago ${fmt(need, C)} desde la caja`, `La caja tiene ${fmt(bal[C], C)}: no hace falta cambiar moneda.`);
    const t = await transferToken(ctx, C, s.wallet, need, label);
    if (!t.ok) return failPayment(ctx, s, `La transferencia falló: ${t.error}`);
    bal[C] -= need;
    return basePayment(ctx, s, { status: "paid", source: "local_balance", paidToken: C, paidAmount: s.amount, txHash: t.txHash });
  }

  // b) Convert only the shortfall USD₮ → local, per student.
  const shortfall = need - bal[C];
  log.info(
    "cambio",
    `${label}: necesita ${fmt(need, C)}`,
    `La caja tiene ${fmt(bal[C], C)} y ${fmt(bal.USDT, "USDT")}. Pido a Textile ${fmt(shortfall, C)} a cambio de USD₮ (orden por becario, no un cambio gigante del mes).`,
  );
  const spec: SwapSpec = { sell: "USDT", buy: C, exact: "buy", amount: shortfall, purpose: "payout", refRate: ctx.rates[C]?.rate };
  const plan = await planSwap(ctx, spec);
  if (!plan.ok) {
    log.warn("cambio", `${label}: Textile no cotiza ${fmt(shortfall, C)}`, `Motivo: ${plan.reason}. Aplico la regla de respaldo: pagar este ciclo en USD₮.`);
    return payFallback(ctx, s, need, plan.reason, plan.code === "no_quote" || plan.code === "no_corridor");
  }
  const chunksNote = plan.chunks.length > 1 ? ` en ${plan.chunks.length} órdenes partidas` : "";
  log.info(
    "cambio",
    `${label}: cotización ${fmt(plan.sellTotal, "USDT")} → ${fmt(plan.buyTotal, C)}${chunksNote}`,
    `Tasa ${formatNumber(plan.rate, 2)} ${TOKENS[C].display} por USD₮ (comisión de protocolo ${fmt(plan.feeTotal, "USDT")}). El costo de cambio lo absorbe la fundación; el becario recibe su monto fijo.`,
  );

  if (bal.USDT < plan.sellTotal) {
    const ok = await raiseUsdt(ctx, plan.sellTotal - bal.USDT, C);
    if (!ok) return insufficient(ctx, s, plan.sellTotal);
  }
  if (ctx.spentUsdt + plan.sellTotal > ctx.capUsdt) {
    return failPayment(ctx, s, `Supera el límite de seguridad de ${fmt(ctx.capUsdt, "USDT")} por ciclo (MAX_USDT_PER_CYCLE).`);
  }

  const exec = await executeSwap(ctx, plan);
  if (!exec.ok) {
    if (exec.partial) {
      bal.USDT -= exec.partial.sellTotal;
      bal[C] += exec.partial.buyTotal;
      ctx.spentUsdt += exec.partial.sellTotal;
      log.warn("cambio", `${label}: cambio incompleto`, `${exec.error} Lo ya cambiado queda en la caja como buffer en ${TOKENS[C].display}.`);
    }
    return payFallback(ctx, s, need, exec.error, false);
  }
  bal.USDT -= exec.sellTotal;
  bal[C] += exec.buyTotal;
  ctx.spentUsdt += exec.sellTotal;

  const t = await transferToken(ctx, C, s.wallet, need, label);
  if (!t.ok) return failPayment(ctx, s, `El cambio salió bien pero la transferencia falló: ${t.error}`);
  bal[C] -= need;
  return basePayment(ctx, s, {
    status: "paid",
    source: "swap",
    paidToken: C,
    paidAmount: s.amount,
    usdtCost: String(units(exec.sellTotal, "USDT")),
    swapId: exec.record.id,
    txHash: t.txHash,
  });
}

async function payFallback(ctx: CycleCtx, s: Student, need: bigint, reason: string, isNoQuote: boolean): Promise<Payment> {
  const { bal, log } = ctx;
  const C = s.currency;
  const rate = ctx.rates[C];
  if (!rate) return failPayment(ctx, s, `No hay cotización ni precio de referencia para ${TOKENS[C].display}.`);
  const usdtValue = Math.ceil((units(need, C) / rate.rate) * 100) / 100;
  const usdt = atomic(usdtValue.toFixed(2), "USDT");

  if (bal.USDT < usdt) {
    const ok = await raiseUsdt(ctx, usdt - bal.USDT, undefined);
    if (!ok) return insufficient(ctx, s, usdt);
  }
  if (ctx.spentUsdt + usdt > ctx.capUsdt) {
    return failPayment(ctx, s, `Supera el límite de seguridad de ${fmt(ctx.capUsdt, "USDT")} por ciclo (MAX_USDT_PER_CYCLE).`);
  }
  log.info(
    "pago",
    `${s.publicId}: respaldo en USD₮`,
    `Pago ${formatToken(usdtValue, "USDT")} (equivale a ${fmt(need, C)} a ${formatNumber(rate.rate, 2)} por USD₮, precio ${rate.source === "textile" ? "de Textile" : "de referencia"}). Este pago NO se marca como pagado en moneda local.`,
  );
  const t = await transferToken(ctx, "USDT", s.wallet, usdt, s.publicId);
  if (!t.ok) return failPayment(ctx, s, `La transferencia de respaldo falló: ${t.error}`);
  bal.USDT -= usdt;
  ctx.spentUsdt += usdt;
  raiseAlert(ctx.db, {
    programId: ctx.programId,
    kind: isNoQuote ? "no_quote" : "fallback",
    severity: "warning",
    token: C,
    title: `Pago en USD₮ por falta de cotización ${TOKENS[C].display}`,
    message: `${s.publicId} cobró ${formatToken(usdtValue, "USDT")} en lugar de ${fmt(need, C)}. Motivo: ${reason}. Avisale al becario: puede pasar sus USD₮ a ${TOKENS[C].display} o retirarlos con Ripio.`,
  });
  return basePayment(ctx, s, {
    status: "fallback",
    source: "fallback_usdt",
    paidToken: "USDT",
    paidAmount: usdtValue.toFixed(2),
    usdtCost: usdtValue.toFixed(2),
    reason,
    txHash: t.txHash,
  });
}

function failPayment(ctx: CycleCtx, s: Student, reason: string): Payment {
  ctx.log.error("pago", `${s.publicId}: no se pudo pagar`, reason);
  raiseAlert(ctx.db, {
    programId: ctx.programId,
    kind: "execution",
    severity: "critical",
    token: s.currency,
    title: `Pago pendiente (${s.publicId})`,
    message: reason,
  });
  return basePayment(ctx, s, { status: "failed", source: "local_balance", reason });
}

function insufficient(ctx: CycleCtx, s: Student, needUsdt: bigint): Payment {
  const wallet = getConfig().agentWallet ?? "";
  const reason = `Fondos insuficientes: hacen falta ${fmt(needUsdt, "USDT")} y la caja tiene ${fmt(ctx.bal.USDT, "USDT")}.`;
  ctx.log.error("pago", `${s.publicId}: fondos insuficientes`, `${reason} Recargá la caja (Ripio Ramp) y volvé a correr el ciclo.`);
  raiseAlert(ctx.db, {
    programId: ctx.programId,
    kind: "insufficient_funds",
    severity: "critical",
    token: s.currency,
    title: "Fondos insuficientes para pagar",
    message: reason,
    rampUrl: rampUrl(s.currency, wallet, Number(s.amount)),
  });
  return basePayment(ctx, s, { status: "failed", source: "local_balance", reason });
}

/**
 * "Bridge": sells local currency nobody needs this cycle to raise USD₮
 * (e.g. the foundation funded in wARS but a student is paid in wCOP).
 */
async function raiseUsdt(ctx: CycleCtx, missing: bigint, forToken: FiatSymbol | undefined): Promise<boolean> {
  const { bal, log, rates } = ctx;
  const target = (missing * 101n) / 100n + 1n;
  const candidates = FIAT_SYMBOLS.filter((c) => c !== forToken)
    .map((c) => ({ c, surplus: bal[c] - (ctx.pendingNeed[c] ?? 0n) }))
    .filter((x) => x.surplus > 0n && rates[x.c])
    .sort((a, b) => units(b.surplus, b.c) / rates[b.c]!.rate - units(a.surplus, a.c) / rates[a.c]!.rate);
  let raised = 0n;
  for (const { c, surplus } of candidates) {
    if (raised >= missing) break;
    const want = target - raised;
    const plan = await planSwap(ctx, { sell: c, buy: "USDT", exact: "buy", amount: want, purpose: "bridge", refRate: rates[c]?.rate });
    if (!plan.ok || plan.sellTotal > surplus) continue;
    log.info(
      "cambio",
      `Puente: vendo ${fmt(plan.sellTotal, c)} → ${fmt(plan.buyTotal, "USDT")}`,
      `Faltaban USD₮ para el pago. Uso ${TOKENS[c].display} que no se necesita en este ciclo (Textile solo tiene pares contra USD₮).`,
    );
    const exec = await executeSwap(ctx, plan);
    if (!exec.ok) {
      if (exec.partial) {
        bal[c] -= exec.partial.sellTotal;
        bal.USDT += exec.partial.buyTotal;
        raised += exec.partial.buyTotal;
      }
      continue;
    }
    bal[c] -= exec.sellTotal;
    bal.USDT += exec.buyTotal;
    raised += exec.buyTotal;
  }
  return raised >= missing;
}

/**
 * Coverage toggle ON: keep only what local-currency obligations need, convert the
 * rest to USD₮. Toggle OFF (program or student): that money stays local.
 */
async function protectIdle(ctx: CycleCtx, completedAfterThis: number): Promise<void> {
  const { program, students, bal, rates, log } = ctx;
  const anyOn = students.some((s) => effectiveCoverage(program, s));
  if (!anyOn) {
    log.info("cobertura", "Cobertura USD₮ apagada", "El saldo queda en las monedas en que se fondeó. Solo cambio lo necesario al pagar.");
    return;
  }
  const remaining = Math.max(0, program.cyclesPlanned - completedAfterThis);
  const reserve: Partial<Record<FiatSymbol, bigint>> = {};
  const reserveOff: Partial<Record<FiatSymbol, bigint>> = {};
  for (const s of students) {
    const per = atomic(s.amount, s.currency);
    if (effectiveCoverage(program, s)) {
      reserve[s.currency] = (reserve[s.currency] ?? 0n) + (remaining > 0 ? per : 0n);
    } else {
      const r = per * BigInt(remaining);
      reserve[s.currency] = (reserve[s.currency] ?? 0n) + r;
      reserveOff[s.currency] = (reserveOff[s.currency] ?? 0n) + r;
    }
  }
  let offShortUsd = 0;
  for (const c of FIAT_SYMBOLS) {
    const short = (reserveOff[c] ?? 0n) - bal[c];
    if (short > 0n && rates[c]) offShortUsd += units(short, c) / rates[c]!.rate;
  }

  let hedged = 0;
  for (const c of FIAT_SYMBOLS) {
    const rate = rates[c]?.rate;
    let excess = bal[c] - (reserve[c] ?? 0n);
    if (excess <= 0n || !rate) continue;
    const excessUsd = units(excess, c) / rate;
    if (offShortUsd > 0) {
      const keepUsd = Math.min(excessUsd, offShortUsd);
      offShortUsd -= keepUsd;
      excess -= atomic((keepUsd * rate).toFixed(6), c);
    }
    if (excess <= 0n || units(excess, c) / rate < MIN_HEDGE_USDT) continue;
    const plan = await planSwap(ctx, { sell: c, buy: "USDT", exact: "sell", amount: excess, purpose: "hedge", refRate: rate });
    if (!plan.ok) {
      log.warn("cobertura", `No protegí ${fmt(excess, c)}`, `Textile no cotizó la venta: ${plan.reason}. Queda en ${TOKENS[c].display} y reintento en el próximo ciclo.`);
      continue;
    }
    const exec = await executeSwap(ctx, plan);
    if (!exec.ok) {
      log.warn("cobertura", `No protegí ${fmt(excess, c)}`, exec.error);
      continue;
    }
    bal[c] -= exec.sellTotal;
    bal.USDT += exec.buyTotal;
    hedged += 1;
    ctx.db.hedgeLots.push({
      id: newId("lot"),
      programId: program.id,
      token: c,
      localAmount: String(units(exec.sellTotal, c)),
      usdtAmount: String(units(exec.buyTotal, "USDT")),
      rate: exec.record.rate,
      at: nowIso(),
      simulated: ctx.mode === "dry_run",
    });
    log.ok(
      "cobertura",
      `Protegí excedente: ${fmt(exec.sellTotal, c)} → ${fmt(exec.buyTotal, "USDT")}`,
      `Cobertura activa: guardo en ${TOKENS[c].display} solo lo que necesitan los próximos pagos en esa moneda; el resto queda en dólares estables mientras espera.`,
    );
  }
  if (hedged === 0) {
    log.info("cobertura", "Nada para proteger", "La moneda local en caja solo cubre los próximos pagos (buffer) o lo que pidieron dejar en local.");
  }
}

function checkCoverage(ctx: CycleCtx): void {
  const { program, students, bal, rates, db, log } = ctx;
  const perCycle = perCycleUsdt(students, rates);
  if (perCycle <= 0) return;
  const { total } = valueUsdt(bal, rates);
  const runway = total / perCycle;
  const remaining = Math.max(0, program.cyclesPlanned - program.cyclesCompleted);
  const threshold = Math.min(program.lowCoverageCycles, remaining);
  if (remaining > 0 && runway < threshold) {
    const deficitUsd = Math.max(0, perCycle * threshold - total);
    const main = mainCurrency(students);
    const wallet = getConfig().agentWallet ?? "";
    raiseAlert(db, {
      programId: program.id,
      kind: "low_coverage",
      severity: runway < 1 ? "critical" : "warning",
      title: `La caja alcanza para ${formatNumber(runway, 1)} ciclos`,
      message: `Umbral configurado: ${threshold} ciclos. Faltan ≈ ${formatUsd(deficitUsd)} para volver al umbral. Podés recargar en moneda local con Ripio Ramp directo a la wallet del agente.`,
      rampUrl: rampUrl(main, wallet, rates[main] ? deficitUsd * rates[main]!.rate : undefined),
    });
    log.warn("alerta", `Cobertura baja: ${formatNumber(runway, 1)} ciclos`, `La caja vale ≈ ${formatUsd(total)} y cada ciclo cuesta ≈ ${formatUsd(perCycle)}. Avisé a la fundación con link a Ripio Ramp.`);
  } else {
    resolveAlerts(db, program.id, "low_coverage");
    log.ok("cobertura", `Salud de la caja: alcanza para ${formatNumber(runway, 1)} ciclos`, `Caja ≈ ${formatUsd(total)}; cada ciclo ≈ ${formatUsd(perCycle)}.`);
  }
}

function mainCurrency(students: Student[]): FiatSymbol {
  const counts = new Map<FiatSymbol, number>();
  for (const s of students) counts.set(s.currency, (counts.get(s.currency) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "wCOP";
}

/* ------------------------------------------------------------------ */
/* Day-before preparation (buffer)                                     */
/* ------------------------------------------------------------------ */

/**
 * Runs the liquidity pre-check and pre-converts the next cycle's local currency
 * while makers are online, so payday only needs transfers.
 */
export async function prepareNextCycle(programId: string): Promise<ActionResult> {
  const { levels, error } = await fetchLevels();
  const rates = await getRates(levels);
  return withLock(async () => {
    const db = readDB();
    const cfg = getConfig();
    const mode: RunMode = cfg.dryRun ? "dry_run" : "live";
    const program = db.programs.find((p) => p.id === programId);
    if (!program) return { ok: false, message: "Programa no encontrado." };
    const students = db.students.filter((s) => s.programId === programId && s.active);
    const log = makeLogger(db, program.id, undefined, mode);
    if (mode === "live" && !checkLiveReadiness().ready) {
      return { ok: false, message: "El modo en vivo no está listo; revisá la página Identidad." };
    }
    const check = buildPrecheck(levels, students, error);
    db.prechecks[programId] = check;
    program.lastPrecheckFor = program.nextCycleAt;
    log.info("liquidez", `Preparación del ciclo del ${formatDate(program.nextCycleAt)}`, "Pre-chequeo de liquidez y pre-conversión del buffer en moneda local (un día antes del pago).");
    logPrecheck(log, check);

    const treasury = await loadTreasury(db, program, mode);
    if (treasury.error) {
      writeDB(db);
      return { ok: false, message: treasury.error };
    }
    const bal = treasury.balances;
    const ctx: CycleCtx = {
      db,
      mode,
      programId,
      log,
      maxSlippageBps: cfg.maxSlippageBps,
      program,
      students,
      bal,
      rates,
      spentUsdt: 0n,
      capUsdt: parseUnits(String(cfg.maxUsdtPerCycle), 6),
      pendingNeed: {},
    };
    let converted = 0;
    for (const c of FIAT_SYMBOLS) {
      const need = students.filter((s) => s.currency === c).reduce((a, s) => a + atomic(s.amount, c), 0n);
      if (need === 0n || bal[c] >= need) continue;
      const status = check.currencies.find((x) => x.token === c)?.status;
      if (status === "no_quote" || status === "no_corridor") continue;
      for (const s of students.filter((x) => x.currency === c)) {
        const per = atomic(s.amount, c);
        if (bal[c] >= need) break;
        const amount = per < need - bal[c] ? per : need - bal[c];
        const plan = await planSwap(ctx, { sell: "USDT", buy: c, exact: "buy", amount, purpose: "payout", refRate: rates[c]?.rate });
        if (!plan.ok || bal.USDT < plan.sellTotal || ctx.spentUsdt + plan.sellTotal > ctx.capUsdt) break;
        const exec = await executeSwap(ctx, plan);
        if (!exec.ok) break;
        bal.USDT -= exec.sellTotal;
        bal[c] += exec.buyTotal;
        ctx.spentUsdt += exec.sellTotal;
        converted += 1;
        log.ok("cambio", `Buffer listo: ${fmt(exec.sellTotal, "USDT")} → ${fmt(exec.buyTotal, c)}`, `Pre-convertido para ${s.publicId}; el día de pago solo queda transferir.`);
      }
    }
    if (converted === 0) log.info("cambio", "No hizo falta pre-convertir", "La caja ya tiene el buffer en moneda local, o la moneda no tiene liquidez de pago hoy.");
    persistTreasury(db, program, mode, bal);
    writeDB(db);
    return { ok: true, message: converted ? `Pre-convertí ${converted} pago(s) para el próximo ciclo.` : "Pre-chequeo listo; no hizo falta pre-convertir." };
  });
}

/* ------------------------------------------------------------------ */
/* Manual hedge                                                        */
/* ------------------------------------------------------------------ */

export async function protectNow(programId: string): Promise<ActionResult> {
  const { levels } = await fetchLevels();
  const rates = await getRates(levels);
  return withLock(async () => {
    const db = readDB();
    const cfg = getConfig();
    const mode: RunMode = cfg.dryRun ? "dry_run" : "live";
    const program = db.programs.find((p) => p.id === programId);
    if (!program) return { ok: false, message: "Programa no encontrado." };
    if (mode === "live" && !checkLiveReadiness().ready) {
      return { ok: false, message: "El modo en vivo no está listo; revisá la página Identidad." };
    }
    const students = db.students.filter((s) => s.programId === programId && s.active);
    const log = makeLogger(db, program.id, undefined, mode);
    const treasury = await loadTreasury(db, program, mode);
    if (treasury.error) return { ok: false, message: treasury.error };
    const ctx: CycleCtx = {
      db,
      mode,
      programId,
      log,
      maxSlippageBps: cfg.maxSlippageBps,
      program,
      students,
      bal: treasury.balances,
      rates,
      spentUsdt: 0n,
      capUsdt: parseUnits(String(cfg.maxUsdtPerCycle), 6),
      pendingNeed: {},
    };
    log.info("cobertura", "Protección manual de la caja", "La fundación pidió revisar el excedente ahora.");
    await protectIdle(ctx, program.cyclesCompleted);
    persistTreasury(db, program, mode, ctx.bal);
    writeDB(db);
    return { ok: true, message: "Revisé el excedente de la caja. Detalle en la bitácora." };
  });
}
