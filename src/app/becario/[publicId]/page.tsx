import { notFound } from "next/navigation";
import { ArrowUpRight, CalendarClock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { PaymentPill, Pill, SimPill } from "@/components/status";
import { AddressLink, TxLink } from "@/components/tx-link";
import { formatDate, formatDateTime, formatNumber, formatRelativeDays, formatToken } from "@/lib/format";
import { TOKENS, offRampUrl } from "@/lib/tokens";
import { loadStudentView } from "@/lib/views";

export const dynamic = "force-dynamic";

const FREQ: Record<string, string> = { monthly: "cada mes", biweekly: "cada dos semanas", weekly: "cada semana" };

export default async function StudentPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const d = await loadStudentView(publicId);
  if (!d) notFound();
  const { student: s, program: p } = d;
  const t = TOKENS[s.currency];
  const settled = d.payments.filter((x) => x.status === "paid" || x.status === "fallback");
  const received = settled.filter((x) => x.paidToken === s.currency).reduce((a, x) => a + Number(x.paidAmount), 0);
  const fallbacks = settled.filter((x) => x.status === "fallback");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={`${p.organization} · ${p.name}`}
        title={`Tu beca · ${s.publicId}`}
        description={`Cobrás ${formatToken(s.amount, s.currency)} ${FREQ[p.frequency]} en tu wallet de Celo. Esta página es pública y no muestra tu nombre.`}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Próximo pago</CardDescription>
            <CardTitle className="text-lg font-semibold text-ink">{s.active ? formatDate(p.nextCycleAt) : "En pausa"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {s.active ? formatRelativeDays(p.nextCycleAt) : "La organización pausó los pagos"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Recibido en {t.display}</CardDescription>
            <CardTitle className="text-lg font-semibold tabular text-ink">{formatNumber(received, t.displayDecimals)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {settled.length} {settled.length === 1 ? "pago" : "pagos"}
              {fallbacks.length > 0 ? ` · ${fallbacks.length} en USD₮` : ""}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Tu wallet</CardDescription>
            <CardTitle className="text-lg font-semibold">
              <AddressLink address={s.wallet} className="text-sm" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Celo mainnet</p>
          </CardContent>
        </Card>
      </div>

      {fallbacks.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/70 px-4 py-3 text-[13px] text-[oklch(0.4_0.08_70)]">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Algunos pagos llegaron en USD₮ (dólar digital) porque ese día no había liquidez para comprar {t.display}. Recibiste el mismo valor,
            calculado a la tasa de mercado del momento. Podés convertirlo a {t.fiat} desde Ripio.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de pagos</CardTitle>
          <CardDescription>Cada pago enlaza a su transacción en Celoscan para que puedas verificarlo.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no recibiste pagos. El primero está programado para el {formatDate(p.nextCycleAt)}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Transacción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.payments.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="text-xs tabular">{formatDateTime(x.at)}</TableCell>
                    <TableCell className="tabular">
                      {x.status === "failed" || x.status === "skipped" ? "—" : formatToken(x.paidAmount, x.paidToken)}
                    </TableCell>
                    <TableCell>
                      <PaymentPill status={x.status} />
                    </TableCell>
                    <TableCell className="text-right">{x.txHash ? <TxLink hash={x.txHash} /> : <SimPill simulated={x.simulated} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>¿Querés pasar tu beca a tu cuenta bancaria?</CardTitle>
          <CardDescription>
            Con Ripio podés vender {t.display} o USD₮ y recibir {t.fiat} en tu cuenta. {d.rate && <>Hoy 1 USD₮ ≈ {formatNumber(d.rate, d.rate > 100 ? 0 : 2)} {t.display}.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href={offRampUrl(s.currency)} target="_blank" rel="noreferrer">
              Retirar con Ripio <ArrowUpRight />
            </a>
          </Button>
          {d.cfg.dryRun && <Pill tone="warn">Esta app está en modo simulación</Pill>}
        </CardContent>
      </Card>
    </div>
  );
}
