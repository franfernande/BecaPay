import Link from "next/link";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { LogList } from "@/components/log-list";
import { PageHeader } from "@/components/page-header";
import { CyclePill, Pill } from "@/components/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadLog } from "@/lib/views";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE = 200;

export default async function LogPage({ searchParams }: { searchParams: Promise<{ ciclo?: string }> }) {
  const { ciclo } = await searchParams;
  const d = loadLog(ciclo ? { cycleId: ciclo } : undefined);
  const selected = ciclo ? d.cycles.find((c) => c.id === ciclo) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bitácora del agente"
        title="Cada decisión, explicada"
        description="El agente anota qué consultó, qué decidió y por qué: liquidez, cambios, pagos, coberturas y alertas. Las entradas simuladas están marcadas."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card size="sm" className="h-fit">
          <CardHeader>
            <CardTitle>Ciclos</CardTitle>
            <CardDescription>Filtrá la bitácora por ciclo de pago.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            <Link
              href="/bitacora"
              className={cn("rounded-md px-2 py-1.5 text-[13px] hover:bg-muted", !ciclo && "bg-secondary font-medium text-ink")}
            >
              Toda la actividad
            </Link>
            {d.cycles.length === 0 && <p className="px-2 text-xs text-muted-foreground">Aún no hay ciclos.</p>}
            {d.cycles.slice(0, 30).map((c) => (
              <Link
                key={c.id}
                href={`/bitacora?ciclo=${c.id}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted",
                  ciclo === c.id && "bg-secondary font-medium text-ink",
                )}
              >
                <span className="tabular">{formatDate(c.period)}</span>
                <span className="flex items-center gap-1">
                  {c.mode === "dry_run" && <Pill tone="warn">Sim.</Pill>}
                  <CyclePill status={c.status} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? `Ciclo del ${formatDate(selected.period)}` : "Actividad reciente"}</CardTitle>
            <CardDescription>
              {selected
                ? `${selected.trigger === "manual" ? "Ejecutado a mano" : "Programado"} · iniciado ${formatDateTime(selected.startedAt)}${selected.summary ? ` · ${selected.summary}` : ""}`
                : `${d.log.length} entradas${d.log.length > PAGE ? ` · mostrando las ${PAGE} más recientes` : ""}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.log.length === 0 ? (
              <EmptyState icon={<ScrollText />} title="La bitácora está vacía">
                Creá un programa o cargá la demo y corré un ciclo: acá vas a ver cada paso que da el agente.
              </EmptyState>
            ) : (
              <LogList entries={d.log.slice(0, PAGE)} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
