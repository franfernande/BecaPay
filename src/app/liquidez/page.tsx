import { CalendarCheck, Droplets, TriangleAlert } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/action-button";
import { QuoteForm } from "@/components/forms/quote-form";
import { PageHeader } from "@/components/page-header";
import { LiquidityPill, MvpPill, Pill, TokenMark } from "@/components/status";
import { prepareCycleAction, runPrecheckAction } from "@/app/actions";
import { formatDateTime, formatNumber, formatUsd } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import { loadLiquidityPage } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function LiquidityPage() {
  const d = await loadLiquidityPage();
  const inUse = d.corridors.filter((c) => c.students > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Textile · Celo mainnet"
        title="Liquidez para pagar en moneda local"
        description="Antes de cada pago el agente lee los niveles publicados por los market makers de Textile. Si una moneda no tiene liquidez, el becario cobra en USD₮ y la fundación recibe un aviso."
        actions={
          d.program && (
            <>
              <ActionButton variant="outline" icon={<CalendarCheck />} action={prepareCycleAction.bind(null, d.program.id)} pendingLabel="Preparando…">
                Preparar próximo ciclo
              </ActionButton>
              <ActionButton icon={<Droplets />} action={runPrecheckAction.bind(null, d.program.id)} pendingLabel="Consultando…">
                Revisar liquidez ahora
              </ActionButton>
            </>
          )
        }
      />

      {d.market.error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-danger-soft px-4 py-3 text-[13px] text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            No pude leer los niveles de Textile: {d.market.error}. El agente no cambia a ciegas: si no hay cotización, paga en USD₮ y avisa.
          </p>
        </div>
      )}

      {inUse.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {inUse.map((c) => (
            <Card key={c.token} size="sm">
              <CardHeader>
                <CardDescription className="flex items-center justify-between gap-2">
                  <TokenMark token={c.token} className="text-ink" />
                  <LiquidityPill status={c.status} />
                </CardDescription>
                <CardTitle className="text-lg font-semibold tabular text-ink">
                  {formatNumber(c.needLocal, TOKENS[c.token].displayDecimals)} {TOKENS[c.token].display}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Necesidad del próximo ciclo · {c.students} {c.students === 1 ? "becario" : "becarios"}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{c.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Corredores wFIAT ↔ USD₮</CardTitle>
          <CardDescription>
            Niveles indicativos publicados por Textile (GET /v2/rfq/levels). La cotización firme se pide recién al pagar.
            {d.market.levels?.asOf && <> Datos de {formatDateTime(d.market.levels.asOf)}.</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Moneda</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Tasa (por USD₮)</TableHead>
                <TableHead className="text-right">Para pagar (USD₮ → local)</TableHead>
                <TableHead className="hidden text-right md:table-cell">Para cubrir (local → USD₮)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.corridors.map((c) => (
                <TableRow key={c.token}>
                  <TableCell>
                    <TokenMark token={c.token} />
                    <div className="mt-0.5">
                      <MvpPill status={TOKENS[c.token].mvp} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <LiquidityPill status={c.status} />
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {c.rate ? formatNumber(c.rate, c.rate > 100 ? 0 : 3) : "—"}
                    {c.rateSource === "referencia" && <div className="text-[11px] text-muted-foreground">referencia externa</div>}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {c.payout && c.payout.local > 0 ? (
                      <>
                        <div>
                          {formatNumber(c.payout.local, 0)} {TOKENS[c.token].display}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          ≈ {formatUsd(c.payout.usdt, 0)} · {c.payout.levels} niveles
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{c.payout ? "0 (sin makers)" : "sin corredor"}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right tabular md:table-cell">
                    {c.funding && c.funding.local > 0 ? (
                      <>
                        <div>
                          {formatNumber(c.funding.local, 0)} {TOKENS[c.token].display}
                        </div>
                        <div className="text-[11px] text-muted-foreground">≈ {formatUsd(c.funding.usdt, 0)}</div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Probar una cotización</CardTitle>
          <CardDescription>Pide una vista previa a Textile (POST /v2/rfq/preview). No reserva liquidez ni firma nada.</CardDescription>
        </CardHeader>
        <CardContent>
          <QuoteForm />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Actividad con Textile</CardTitle>
          <CardDescription>Volumen cotizado y ejecutado por el agente (simulado y real).</CardDescription>
          {d.lastPrecheck && (
            <CardAction>
              <Pill tone={d.lastPrecheck.ok ? "ok" : "warn"}>Último pre-chequeo {formatDateTime(d.lastPrecheck.at)}</Pill>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <Metric label="Vistas previas" value={String(d.textile.previews)} />
          <Metric label="Cotizaciones firmes" value={String(d.textile.firmQuotes)} />
          <Metric label="Volumen cotizado" value={formatUsd(d.textile.quotedNotionalUsdt, 0)} />
          <Metric label="Volumen ejecutado" value={formatUsd(d.textile.filledNotionalUsdt, 0)} />
          <Metric label="Órdenes ejecutadas" value={String(d.textile.fills)} />
          <Metric label="Sin cotización" value={String(d.textile.noQuotes)} />
          <Metric label="Comisiones pagadas" value={formatUsd(d.textile.feesUsdt)} />
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold tabular text-ink">{value}</div>
    </div>
  );
}
