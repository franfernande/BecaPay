import "server-only";
import { formatUnits, parseUnits } from "viem";
import { ALL_TOKENS, FIAT_SYMBOLS, TOKENS } from "../tokens";
import type {
  Alert,
  DB,
  FiatSymbol,
  Frequency,
  LogLevel,
  LogStep,
  Program,
  RunMode,
  Student,
  TokenSymbol,
} from "../types";
import { newId, nowIso } from "../store";
import { formatToken } from "../format";
import { toUsdt, type Rates } from "../textile/liquidity";

export type Balances = Record<TokenSymbol, bigint>;

export function zeroBalances(): Balances {
  return Object.fromEntries(ALL_TOKENS.map((s) => [s, 0n])) as Balances;
}

export function ledgerToBalances(db: DB, programId: string): Balances {
  const b = zeroBalances();
  const ledger = db.ledger[programId] ?? {};
  for (const s of ALL_TOKENS) {
    const v = ledger[s];
    if (v) b[s] = parseUnits(v, TOKENS[s].decimals);
  }
  return b;
}

export function balancesToLedger(b: Balances): Partial<Record<TokenSymbol, string>> {
  const out: Partial<Record<TokenSymbol, string>> = {};
  for (const s of ALL_TOKENS) if (b[s] > 0n) out[s] = formatUnits(b[s], TOKENS[s].decimals);
  return out;
}

export const units = (amount: bigint, token: TokenSymbol): number => Number(formatUnits(amount, TOKENS[token].decimals));
export const atomic = (amount: string | number, token: TokenSymbol): bigint => {
  const decimals = TOKENS[token].decimals;
  const s = typeof amount === "number" ? amount.toFixed(Math.min(decimals, 8)) : amount;
  return parseUnits(s, decimals);
};
export const fmt = (amount: bigint, token: TokenSymbol): string => formatToken(units(amount, token), token);

export function effectiveCoverage(program: Program, student: Student): boolean {
  if (student.coverage === "on") return true;
  if (student.coverage === "off") return false;
  return program.coverageEnabled;
}

export function advanceDate(iso: string, frequency: Frequency): string {
  const d = new Date(iso);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else {
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d.toISOString();
}

export interface Logger {
  info: (step: LogStep, title: string, detail?: string, txHash?: string) => void;
  ok: (step: LogStep, title: string, detail?: string, txHash?: string) => void;
  warn: (step: LogStep, title: string, detail?: string, txHash?: string) => void;
  error: (step: LogStep, title: string, detail?: string, txHash?: string) => void;
}

export function makeLogger(db: DB, programId: string | undefined, cycleId: string | undefined, mode: RunMode): Logger {
  const push = (level: LogLevel) => (step: LogStep, title: string, detail?: string, txHash?: string) => {
    db.log.push({
      id: newId("log"),
      at: nowIso(),
      programId,
      cycleId,
      level,
      step,
      title,
      detail,
      txHash,
      simulated: mode === "dry_run",
    });
  };
  return { info: push("info"), ok: push("ok"), warn: push("warn"), error: push("error") };
}

/** Raises an alert, or refreshes the open one of the same kind/token instead of duplicating it. */
export function raiseAlert(db: DB, alert: Omit<Alert, "id" | "at" | "resolved">): void {
  const open = db.alerts.find(
    (a) => !a.resolved && a.programId === alert.programId && a.kind === alert.kind && a.token === alert.token,
  );
  if (open) {
    Object.assign(open, alert, { at: nowIso() });
    return;
  }
  db.alerts.push({ ...alert, id: newId("alr"), at: nowIso(), resolved: false });
}

export function resolveAlerts(db: DB, programId: string, kind: Alert["kind"]): void {
  for (const a of db.alerts) if (a.programId === programId && a.kind === kind && !a.resolved) a.resolved = true;
}

export function valueUsdt(b: Balances, rates: Rates): { total: number; unpriced: TokenSymbol[] } {
  let total = 0;
  const unpriced: TokenSymbol[] = [];
  for (const s of ALL_TOKENS) {
    if (b[s] <= 0n) continue;
    const v = toUsdt(units(b[s], s), s, rates);
    if (v === undefined) unpriced.push(s);
    else total += v;
  }
  return { total, unpriced };
}

export function perCycleUsdt(students: Student[], rates: Rates): number {
  let total = 0;
  for (const s of students) {
    if (!s.active) continue;
    total += toUsdt(Number(s.amount), s.currency, rates) ?? 0;
  }
  return total;
}

export function describeBalances(b: Balances): string {
  const parts = ALL_TOKENS.filter((s) => b[s] > 0n).map((s) => fmt(b[s], s));
  return parts.length ? parts.join(" · ") : "vacía";
}

export function fiatInUse(students: Student[]): FiatSymbol[] {
  const set = new Set(students.filter((s) => s.active).map((s) => s.currency));
  return FIAT_SYMBOLS.filter((s) => set.has(s));
}
