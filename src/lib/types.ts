export type FiatSymbol = "wCOP" | "wBRL" | "wARS" | "wMXN" | "wPEN" | "wCLP";
export type TokenSymbol = FiatSymbol | "USDT";

export type CoverageOverride = "inherit" | "on" | "off";
export type Frequency = "monthly" | "biweekly" | "weekly";
export type RunMode = "dry_run" | "live";

export interface Program {
  id: string;
  name: string;
  organization: string;
  coverageEnabled: boolean;
  frequency: Frequency;
  nextCycleAt: string;
  autoRun: boolean;
  cyclesPlanned: number;
  cyclesCompleted: number;
  lowCoverageCycles: number;
  lastPrecheckFor?: string;
  createdAt: string;
  demo: boolean;
}

export interface Student {
  id: string;
  programId: string;
  /** Opaque id: the only identifier shown in public views. */
  publicId: string;
  /** Private (PII). Never rendered in auditor/public views. */
  displayName: string;
  wallet: `0x${string}`;
  currency: FiatSymbol;
  /** Fixed amount per cycle, in the student's currency (decimal string). */
  amount: string;
  coverage: CoverageOverride;
  active: boolean;
  demo: boolean;
  createdAt: string;
}

export interface Deposit {
  id: string;
  programId: string;
  token: TokenSymbol;
  amount: string;
  at: string;
  simulated: boolean;
  txHash?: string;
  note?: string;
}

export type SwapPurpose = "payout" | "hedge" | "bridge";

export interface SwapRecord {
  id: string;
  programId: string;
  cycleId?: string;
  purpose: SwapPurpose;
  sellToken: TokenSymbol;
  buyToken: TokenSymbol;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  /** Local units per 1 USD₮ actually obtained. */
  rate: number;
  chunks: number;
  quoteKind: "preview" | "firm";
  simulated: boolean;
  rfqIds: string[];
  txHashes: string[];
  at: string;
}

export type PaymentStatus = "paid" | "fallback" | "failed" | "skipped";
export type PaymentSource = "local_balance" | "swap" | "fallback_usdt";

export interface Payment {
  id: string;
  cycleId: string;
  programId: string;
  studentId: string;
  studentPublicId: string;
  wallet: string;
  requestedToken: FiatSymbol;
  requestedAmount: string;
  paidToken: TokenSymbol;
  paidAmount: string;
  /** USD₮ spent to fund this payment (swap cost or fallback amount). */
  usdtCost?: string;
  source: PaymentSource;
  status: PaymentStatus;
  reason?: string;
  swapId?: string;
  txHash?: string;
  simulated: boolean;
  at: string;
}

export type LiquidityStatus = "ok" | "fragile" | "no_quote" | "no_corridor" | "unknown";

export interface CurrencyLiquidity {
  token: FiatSymbol;
  status: LiquidityStatus;
  /** Max local units Textile publishes for USD₮ → local (payout leg). */
  payoutDepthLocal?: number;
  payoutDepthUsdt?: number;
  /** Max local units Textile publishes for local → USD₮ (funding/hedge leg). */
  fundingDepthLocal?: number;
  midRate?: number;
  needLocal: number;
  largestSingleLocal: number;
  students: number;
  note: string;
}

export interface LiquidityCheck {
  at: string;
  asOf?: string;
  ok: boolean;
  currencies: CurrencyLiquidity[];
  error?: string;
}

export type CycleStatus = "running" | "completed" | "partial" | "failed";

export interface Cycle {
  id: string;
  programId: string;
  /** Scheduled date this cycle settles (ISO). */
  period: string;
  trigger: "manual" | "scheduled";
  mode: RunMode;
  status: CycleStatus;
  startedAt: string;
  finishedAt?: string;
  paymentIds: string[];
  precheck?: LiquidityCheck;
  summary?: string;
}

export type LogLevel = "info" | "ok" | "warn" | "error";
export type LogStep =
  | "ciclo"
  | "liquidez"
  | "pago"
  | "cambio"
  | "cobertura"
  | "alerta"
  | "config"
  | "fondeo"
  | "identidad"
  | "seguridad";

export interface LogEntry {
  id: string;
  at: string;
  programId?: string;
  cycleId?: string;
  level: LogLevel;
  step: LogStep;
  title: string;
  detail?: string;
  txHash?: string;
  simulated?: boolean;
}

export type AlertKind =
  | "low_coverage"
  | "no_quote"
  | "fallback"
  | "liquidity"
  | "insufficient_funds"
  | "execution"
  | "config";

export interface Alert {
  id: string;
  at: string;
  programId: string;
  kind: AlertKind;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  token?: TokenSymbol;
  rampUrl?: string;
  resolved: boolean;
}

export interface HedgeLot {
  id: string;
  programId: string;
  token: FiatSymbol;
  localAmount: string;
  usdtAmount: string;
  rate: number;
  at: string;
  simulated: boolean;
}

export interface TextileStats {
  previews: number;
  firmQuotes: number;
  noQuotes: number;
  fills: number;
  quotedNotionalUsdt: number;
  filledNotionalUsdt: number;
  feesUsdt: number;
}

export interface IdentityRecord {
  agentId?: string;
  txHash?: string;
  agentURI?: string;
  registeredAt?: string;
}

export interface DB {
  version: 1;
  activeProgramId?: string;
  programs: Program[];
  students: Student[];
  deposits: Deposit[];
  cycles: Cycle[];
  payments: Payment[];
  swaps: SwapRecord[];
  log: LogEntry[];
  alerts: Alert[];
  hedgeLots: HedgeLot[];
  /** Simulated treasury per program (decimal strings). Used only in DRY_RUN. */
  ledger: Record<string, Partial<Record<TokenSymbol, string>>>;
  textile: TextileStats;
  /** Latest standalone liquidity pre-check per program. */
  prechecks: Record<string, LiquidityCheck>;
  identity: IdentityRecord;
  scheduler: { lastTickAt?: string };
}
