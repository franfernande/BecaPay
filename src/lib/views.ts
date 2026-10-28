import "server-only";
import { getConfig, getPublicConfig, type PublicConfig } from "./config";
import { readDB } from "./store";
import { readOnchainBalances, type OnchainBalances } from "./celo/balances";
import { getLevels, type TextileLevels } from "./textile/client";
import { analyzeCurrency, findPair, fundingDepth, getRates, payoutDepth, toUsdt, type Rates } from "./textile/liquidity";
import { buildPrecheck } from "./agent/cycle";
import { cleanError } from "./agent/executor";
import { ledgerToBalances, perCycleUsdt, units, zeroBalances, type Balances } from "./agent/common";
import { ALL_TOKENS, FIAT_SYMBOLS } from "./tokens";
import type {
  Alert,
  CurrencyLiquidity,
  Cycle,
  DB,
  FiatSymbol,
  LiquidityCheck,
  LogEntry,
  Payment,
  Program,
  Student,
  SwapRecord,
  TokenSymbol,
} from "./types";

export interface TreasuryRow {
  token: TokenSymbol;
  amount: number;
  usd?: number;
  share: number;
}

export interface TreasuryView {
  source: "simulado" | "onchain";
  rows: TreasuryRow[];
  totalUsd: number;
  error?: string;
}

export interface MarketData {
  levels?: TextileLevels;
  rates: Rates;
  error?: string;
}

async function loadMarket(): Promise<MarketData> {
  try {
    const levels = await getLevels();
    return { levels, rates: await getRates(levels) };
  } catch (e) {
    return { rates: await getRates(undefined), error: cleanError(e) };
  }
}

function toRows(b: Balances, rates: Rates): { rows: TreasuryRow[]; totalUsd: number } {
  const rows: TreasuryRow[] = [];
  let total = 0;
  for (const s of ALL_TOKENS) {
    if (b[s] <= 0n) continue;
    const amount = units(b[s], s);
    const usd = toUsdt(amount, s, rates);
    if (usd !== undefined) total += usd;
    rows.push({ token: s, amount, usd, share: 0 });
  }
  for (const r of rows) r.share = total > 0 && r.usd ? r.usd / total : 0;
  rows.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  return { rows, totalUsd: total };
}

function onchainToBalances(o: OnchainBalances): Balances {
  const b = zeroBalances();
  for (const [s, v] of Object.entries(o.tokens)) b[s as TokenSymbol] = v ?? 0n;
  return b;
}

export interface CoveragePnl {
  lots: number;
  hedgedLocalUsd: number;
  hedgedUsdt: number;
  pnlUsd: number;
  pnlPct: number;
}

function coveragePnl(db: DB, programId: string, rates: Rates): CoveragePnl {
  const lots = db.hedgeLots.filter((l) => l.programId === programId);
  let hedgedUsdt = 0;
  let unhedgedNow = 0;
  for (const l of lots) {
    const rate = rates[l.token]?.rate;
    hedgedUsdt += Number(l.usdtAmount);
    unhedgedNow += rate ? Number(l.localAmount) / rate : Number(l.usdtAmount);
  }
  const pnlUsd = hedgedUsdt - unhedgedNow;
  return { lots: lots.length, hedgedLocalUsd: unhedgedNow, hedgedUsdt, pnlUsd, pnlPct: unhedgedNow > 0 ? pnlUsd / unhedgedNow : 0 };
}

function cycleIntervalMs(p: Program): number {
  return (p.frequency === "weekly" ? 7 : p.frequency === "biweekly" ? 14 : 30) * 86_400_000;
}

export function activeProgram(db: DB): Program | undefined {
  return db.programs.find((p) => p.id === db.activeProgramId) ?? db.programs[0];
}

export function paymentUsd(p: Payment, rates: Rates): number {
  if (p.usdtCost) return Number(p.usdtCost);
  return toUsdt(Number(p.paidAmount), p.paidToken, rates) ?? 0;
}

export interface DashboardData {
  cfg: PublicConfig;
  program?: Program;
  programs: Program[];
  students: Student[];
  market: MarketData;
  treasury: TreasuryView;
  onchain: OnchainBalances;
  onchainView: TreasuryView;
  perCycleUsd: number;
  runway?: number;
  budgetUsd: number;
  fundedUsd: number;
  paidUsd: number;
  paymentsCount: number;
  fallbackCount: number;
  nextProgress: number;
  lastCycle?: Cycle;
  lastPayments: Payment[];
  alerts: Alert[];
  log: LogEntry[];
  liquidity: LiquidityCheck;
  pnl: CoveragePnl;
  textile: DB["textile"];
  swaps: SwapRecord[];
  schedulerLastTick?: string;
  /** Consecutive most-recent cycles that paid every student (in local currency or USD₮). */
  streak: number;
  lastPaymentByStudent: Record<string, Payment>;
}

export async function loadDashboard(): Promise<DashboardData> {
  const db = readDB();
  const cfg = getPublicConfig();
  const program = activeProgram(db);
  const [market, onchain] = await Promise.all([loadMarket(), readOnchainBalances(getConfig().agentWallet)]);
  const onchainView = { source: "onchain" as const, ...toRows(onchainToBalances(onchain), market.rates), error: onchain.error };
  const students = program ? db.students.filter((s) => s.programId === program.id) : [];
  const active = students.filter((s) => s.active);

  const treasury: TreasuryView =
    cfg.dryRun && program
      ? { source: "simulado", ...toRows(ledgerToBalances(db, program.id), market.rates) }
      : onchainView;

  const perCycleUsd = perCycleUsdt(active, market.rates);
  const payments = program ? db.payments.filter((p) => p.programId === program.id) : [];
  const settled = payments.filter((p) => p.status === "paid" || p.status === "fallback");
  const deposits = program ? db.deposits.filter((d) => d.programId === program.id) : [];
  const cycles = program ? db.cycles.filter((c) => c.programId === program.id) : [];
  const lastCycle = cycles.at(-1);

  let nextProgress = 0;
  if (program) {
    const interval = cycleIntervalMs(program);
    const left = Date.parse(program.nextCycleAt) - Date.now();
    nextProgress = Math.min(1, Math.max(0, 1 - left / interval));
  }

  const liquidity =
    (program && db.prechecks[program.id] && Date.now() - Date.parse(db.prechecks[program.id].at) < 10 * 60_000
      ? db.prechecks[program.id]
      : undefined) ?? buildPrecheck(market.levels, active, market.error);

  return {
    cfg,
    program,
    programs: db.programs,
    students,
    market,
    treasury,
    onchain,
    onchainView,
    perCycleUsd,
    runway: perCycleUsd > 0 ? treasury.totalUsd / perCycleUsd : undefined,
    budgetUsd: program ? perCycleUsd * program.cyclesPlanned : 0,
    fundedUsd: deposits.reduce((a, d) => a + (toUsdt(Number(d.amount), d.token, market.rates) ?? 0), 0),
    paidUsd: settled.reduce((a, p) => a + paymentUsd(p, market.rates), 0),
    paymentsCount: settled.length,
    fallbackCount: payments.filter((p) => p.status === "fallback").length,
    nextProgress,
    lastCycle,
    lastPayments: lastCycle ? payments.filter((p) => p.cycleId === lastCycle.id) : [],
    alerts: program ? db.alerts.filter((a) => a.programId === program.id && !a.resolved).reverse() : [],
    log: (program ? db.log.filter((l) => !l.programId || l.programId === program.id) : db.log).slice(-10).reverse(),
    liquidity,
    pnl: program ? coveragePnl(db, program.id, market.rates) : { lots: 0, hedgedLocalUsd: 0, hedgedUsdt: 0, pnlUsd: 0, pnlPct: 0 },
    textile: db.textile,
    swaps: program ? db.swaps.filter((s) => s.programId === program.id).slice(-8).reverse() : [],
    schedulerLastTick: db.scheduler.lastTickAt,
    streak: onTimeStreak(cycles),
    lastPaymentByStudent: Object.fromEntries(payments.map((p) => [p.studentId, p])),
  };
}

function onTimeStreak(cycles: Cycle[]): number {
  let n = 0;
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (cycles[i].status !== "completed") break;
    n++;
  }
  return n;
}

export interface ProgramPageData {
  cfg: PublicConfig;
  program?: Program;
  programs: Program[];
  students: Student[];
  deposits: DB["deposits"];
  treasury: TreasuryView;
  onchainView: TreasuryView;
  rates: Rates;
}

export async function loadProgramPage(): Promise<ProgramPageData> {
  const db = readDB();
  const cfg = getPublicConfig();
  const program = activeProgram(db);
  const [market, onchain] = await Promise.all([loadMarket(), readOnchainBalances(getConfig().agentWallet)]);
  const onchainView = { source: "onchain" as const, ...toRows(onchainToBalances(onchain), market.rates), error: onchain.error };
  return {
    cfg,
    program,
    programs: db.programs,
    students: program ? db.students.filter((s) => s.programId === program.id) : [],
    deposits: program ? db.deposits.filter((d) => d.programId === program.id).reverse() : [],
    treasury: cfg.dryRun && program ? { source: "simulado", ...toRows(ledgerToBalances(db, program.id), market.rates) } : onchainView,
    onchainView,
    rates: market.rates,
  };
}

export interface AuditData {
  cfg: PublicConfig;
  programs: { id: string; name: string; organization: string; cycles: number; demo: boolean }[];
  payments: (Payment & { programName: string })[];
  swaps: SwapRecord[];
  totalsByToken: { token: TokenSymbol; amount: number; count: number }[];
  totals: { payments: number; fallbacks: number; cycles: number; paidUsd: number; simulated: number };
  identity: DB["identity"];
}

/** Public view: opaque student ids and wallets only, never names. */
export async function loadAudit(): Promise<AuditData> {
  const db = readDB();
  const market = await loadMarket();
  const programName = new Map(db.programs.map((p) => [p.id, p.name]));
  const settled = db.payments.filter((p) => p.status === "paid" || p.status === "fallback");
  const byToken = new Map<TokenSymbol, { amount: number; count: number }>();
  for (const p of settled) {
    const cur = byToken.get(p.paidToken) ?? { amount: 0, count: 0 };
    cur.amount += Number(p.paidAmount);
    cur.count += 1;
    byToken.set(p.paidToken, cur);
  }
  return {
    cfg: getPublicConfig(),
    programs: db.programs.map((p) => ({
      id: p.id,
      name: p.name,
      organization: p.organization,
      cycles: db.cycles.filter((c) => c.programId === p.id && c.status !== "failed").length,
      demo: p.demo,
    })),
    payments: db.payments
      .slice()
      .reverse()
      .map((p) => ({ ...p, programName: programName.get(p.programId) ?? "—" })),
    swaps: db.swaps.slice().reverse(),
    totalsByToken: [...byToken.entries()].map(([token, v]) => ({ token, ...v })),
    totals: {
      payments: settled.length,
      fallbacks: settled.filter((p) => p.status === "fallback").length,
      cycles: db.cycles.filter((c) => c.status !== "failed").length,
      paidUsd: settled.reduce((a, p) => a + paymentUsd(p, market.rates), 0),
      simulated: settled.filter((p) => p.simulated).length,
    },
    identity: db.identity,
  };
}

export interface StudentViewData {
  student: Student;
  program: Program;
  payments: Payment[];
  rate?: number;
  cfg: PublicConfig;
}

export async function loadStudentView(publicId: string): Promise<StudentViewData | null> {
  const db = readDB();
  const student = db.students.find((s) => s.publicId === publicId.toUpperCase());
  if (!student) return null;
  const program = db.programs.find((p) => p.id === student.programId);
  if (!program) return null;
  const market = await loadMarket();
  return {
    student,
    program,
    payments: db.payments.filter((p) => p.studentId === student.id).reverse(),
    rate: market.rates[student.currency]?.rate,
    cfg: getPublicConfig(),
  };
}

export interface CorridorRow {
  token: FiatSymbol;
  status: CurrencyLiquidity["status"];
  note: string;
  rate?: number;
  rateSource?: "textile" | "referencia";
  payout?: { usdt: number; local: number; levels: number };
  funding?: { usdt: number; local: number; levels: number };
  needLocal: number;
  students: number;
}

export async function loadLiquidityPage() {
  const db = readDB();
  const program = activeProgram(db);
  const market = await loadMarket();
  const students = program ? db.students.filter((s) => s.programId === program.id && s.active) : [];
  const corridors: CorridorRow[] = FIAT_SYMBOLS.map((token) => {
    const group = students.filter((s) => s.currency === token);
    const amounts = group.map((s) => Number(s.amount));
    const a = analyzeCurrency(market.levels, token, amounts.reduce((x, y) => x + y, 0), Math.max(0, ...amounts), group.length);
    const pp = findPair(market.levels, "USDT", token);
    const fp = findPair(market.levels, token, "USDT");
    const pd = payoutDepth(market.levels, token);
    const fd = fundingDepth(market.levels, token);
    return {
      token,
      status: a.status,
      note: a.note,
      rate: market.rates[token]?.rate,
      rateSource: market.rates[token]?.source,
      payout: pd && pp ? { ...pd, levels: pp.levels.length } : undefined,
      funding: fd && fp ? { ...fd, levels: fp.levels.length } : undefined,
      needLocal: a.needLocal,
      students: group.length,
    };
  });
  return {
    cfg: getPublicConfig(),
    program,
    market,
    corridors,
    check: buildPrecheck(market.levels, students, market.error),
    lastPrecheck: program ? db.prechecks[program.id] : undefined,
    students,
    textile: db.textile,
  };
}

export function loadLog(filter?: { cycleId?: string }) {
  const db = readDB();
  const program = activeProgram(db);
  let log = db.log.slice().reverse();
  if (filter?.cycleId) log = log.filter((l) => l.cycleId === filter.cycleId);
  return {
    cfg: getPublicConfig(),
    program,
    log,
    cycles: db.cycles.slice().reverse(),
  };
}
