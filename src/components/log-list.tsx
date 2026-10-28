import {
  ArrowLeftRight,
  BadgeCheck,
  CalendarClock,
  Droplets,
  Lock,
  Send,
  Settings2,
  ShieldHalf,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { LogEntry, LogStep } from "@/lib/types";
import { TxLink } from "@/components/tx-link";
import { Pill } from "@/components/status";

const STEP: Record<LogStep, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  ciclo: { label: "Ciclo", Icon: CalendarClock },
  liquidez: { label: "Liquidez", Icon: Droplets },
  pago: { label: "Pago", Icon: Send },
  cambio: { label: "Cambio", Icon: ArrowLeftRight },
  cobertura: { label: "Cobertura", Icon: ShieldHalf },
  alerta: { label: "Alerta", Icon: TriangleAlert },
  config: { label: "Configuración", Icon: Settings2 },
  fondeo: { label: "Fondeo", Icon: Wallet },
  identidad: { label: "Identidad", Icon: BadgeCheck },
  seguridad: { label: "Seguridad", Icon: Lock },
};

const LEVEL_RING: Record<LogEntry["level"], string> = {
  info: "bg-secondary text-primary",
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-[oklch(0.5_0.11_70)]",
  error: "bg-danger-soft text-destructive",
};

export function LogList({ entries, compact = false }: { entries: LogEntry[]; compact?: boolean }) {
  return (
    <ol className="relative grid gap-0">
      {entries.map((e, i) => {
        const { label, Icon } = STEP[e.step] ?? STEP.config;
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < entries.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />}
            <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full", LEVEL_RING[e.level])}>
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-medium text-ink">{e.title}</span>
                {e.simulated && <Pill tone="warn">Simulado</Pill>}
              </div>
              {e.detail && (
                <p className={cn("mt-0.5 text-[13px] leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>{e.detail}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{label}</span>
                <span className="tabular">{formatDateTime(e.at)}</span>
                {e.txHash && <TxLink hash={e.txHash} />}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
