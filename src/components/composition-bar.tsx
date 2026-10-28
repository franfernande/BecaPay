import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import type { TokenSymbol } from "@/lib/types";
import { TOKEN_COLOR } from "@/components/status";

export function CompositionBar({
  rows,
  className,
  showLegend = true,
}: {
  rows: { token: TokenSymbol; share: number }[];
  className?: string;
  showLegend?: boolean;
}) {
  const visible = rows.filter((r) => r.share > 0);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Composición de la caja por moneda">
        {visible.map((r) => (
          <div key={r.token} className={cn("h-full first:rounded-l-full last:rounded-r-full", TOKEN_COLOR[r.token])} style={{ width: `${r.share * 100}%` }} />
        ))}
      </div>
      {showLegend && visible.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {visible.map((r) => (
            <span key={r.token} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2 rounded-[3px]", TOKEN_COLOR[r.token])} />
              {TOKENS[r.token].display} <span className="tabular">{formatPercent(r.share, 0)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Calm, thin progress line used for "time until next payment" and budget execution. */
export function ProgressLine({ value, tone = "primary", className }: { value: number; tone?: "primary" | "success" | "warning"; className?: string }) {
  const color = tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
