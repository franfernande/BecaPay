import Link from "next/link";
import { ShieldCheck, FlaskConical } from "lucide-react";
import { getPublicConfig } from "@/lib/config";
import { startScheduler } from "@/lib/agent/scheduler";
import { NavLinks } from "@/components/nav-links";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AppHeader() {
  const cfg = getPublicConfig();
  // Idempotent: guarantees the scheduler runs even if instrumentation could not start it.
  startScheduler();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="BecaPay, ir al panel">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
              <path
                d="M6 19V5h6.2c2.9 0 4.8 1.6 4.8 4.2s-1.9 4.3-4.8 4.3H9.4V19H6Zm3.4-8.4h2.6c1.1 0 1.8-.5 1.8-1.4s-.7-1.4-1.8-1.4H9.4v2.8Z"
                fill="currentColor"
              />
              <circle cx="18.2" cy="17.6" r="1.9" fill="oklch(0.8 0.13 85)" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-ink">BecaPay</span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">Becas programables en Celo</span>
          </span>
        </Link>

        <NavLinks />

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={
                cfg.dryRun
                  ? "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-medium text-[oklch(0.42_0.09_70)]"
                  : "ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-medium text-success"
              }
            >
              {cfg.dryRun ? <FlaskConical className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
              <span className="hidden sm:inline">{cfg.dryRun ? "Modo simulación" : "Mainnet en vivo"}</span>
              <span className="sm:hidden">{cfg.dryRun ? "Simulación" : "En vivo"}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-64 text-center">
            {cfg.dryRun
              ? "DRY_RUN=true: el agente usa cotizaciones reales de Textile pero no firma ni envía transacciones."
              : "DRY_RUN=false: el agente firma y envía transacciones reales en Celo mainnet."}
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
