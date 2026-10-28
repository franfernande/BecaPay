import { cn } from "@/lib/utils";
import { MVP_LABEL, TOKENS, type MvpStatus } from "@/lib/tokens";
import type { CycleStatus, LiquidityStatus, PaymentStatus, TokenSymbol } from "@/lib/types";

type Tone = "ok" | "warn" | "bad" | "neutral" | "info";

const TONE: Record<Tone, string> = {
  ok: "border-success/25 bg-success-soft text-success",
  warn: "border-warning/30 bg-warning-soft text-[oklch(0.45_0.1_70)]",
  bad: "border-destructive/25 bg-danger-soft text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-primary/20 bg-accent text-primary",
};

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  const color = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive", neutral: "bg-muted-foreground/50", info: "bg-primary" }[tone];
  return <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full", color, className)} />;
}

export const LIQUIDITY_LABEL: Record<LiquidityStatus, string> = {
  ok: "Liquidez suficiente",
  fragile: "Liquidez justa",
  no_quote: "Sin cotización",
  no_corridor: "Sin corredor",
  unknown: "Sin datos",
};

export const LIQUIDITY_TONE: Record<LiquidityStatus, Tone> = {
  ok: "ok",
  fragile: "warn",
  no_quote: "bad",
  no_corridor: "bad",
  unknown: "neutral",
};

export function LiquidityPill({ status }: { status: LiquidityStatus }) {
  return (
    <Pill tone={LIQUIDITY_TONE[status]}>
      <Dot tone={LIQUIDITY_TONE[status]} />
      {LIQUIDITY_LABEL[status]}
    </Pill>
  );
}

export function PaymentPill({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, [Tone, string]> = {
    paid: ["ok", "Pagado"],
    fallback: ["warn", "Pagado en USD₮"],
    failed: ["bad", "No se pudo pagar"],
    skipped: ["neutral", "Omitido"],
  };
  const [tone, label] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function CyclePill({ status }: { status: CycleStatus }) {
  const map: Record<CycleStatus, [Tone, string]> = {
    running: ["info", "En curso"],
    completed: ["ok", "Completado"],
    partial: ["warn", "Parcial"],
    failed: ["bad", "Falló"],
  };
  const [tone, label] = map[status];
  return <Pill tone={tone}>{label}</Pill>;
}

export function MvpPill({ status }: { status?: MvpStatus }) {
  if (!status) return null;
  const tone: Tone = status === "recommended" ? "ok" : status === "careful" ? "warn" : status === "fragile" ? "warn" : "neutral";
  return <Pill tone={tone}>{MVP_LABEL[status]}</Pill>;
}

export function SimPill({ simulated }: { simulated: boolean }) {
  return simulated ? <Pill tone="warn">Simulado</Pill> : <Pill tone="ok">On-chain</Pill>;
}

export const TOKEN_COLOR: Record<TokenSymbol, string> = {
  USDT: "bg-chart-1",
  wCOP: "bg-chart-2",
  wBRL: "bg-chart-3",
  wARS: "bg-chart-4",
  wMXN: "bg-chart-5",
  wPEN: "bg-chart-6",
  wCLP: "bg-chart-7",
};

export function TokenMark({ token, className }: { token: TokenSymbol; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", className)}>
      <span aria-hidden className={cn("size-2 rounded-[3px]", TOKEN_COLOR[token])} />
      {TOKENS[token].display}
    </span>
  );
}
