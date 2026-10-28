import Link from "next/link";
import { ArrowUpRight, Braces, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaymentPill, Pill, SimPill, TokenMark } from "@/components/status";
import { AddressLink, TxLink } from "@/components/tx-link";
import { readIdentityStatus } from "@/lib/celo/identity";
import { formatDateTime, formatNumber, formatToken, formatUsd } from "@/lib/format";
import { CELO_CHAIN_ID, ERC8004_IDENTITY_REGISTRY, TOKENS } from "@/lib/tokens";
import { loadAudit } from "@/lib/views";

export const dynamic = "force-dynamic";

const PURPOSE: Record<string, string> = { payout: "Pago a becario", hedge: "Cobertura", bridge: "Puente de monedas" };

export default async function AuditPage() {
  const [d, identity] = await Promise.all([loadAudit(), readIdentityStatus()]);
  const onchainPayments = d.totals.payments - d.totals.simulated;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vista pública"
        title="Auditoría de pagos"
        description="Cualquier persona puede verificar cada pago y cada cambio de moneda en Celoscan. Los becarios aparecen con un id opaco: no se publican nombres."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/api/public/audit" target="_blank" rel="noreferrer">
              <Braces /> Descargar JSON
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Pagado a becarios" value={formatUsd(d.totals.paidUsd)} hint={`${d.totals.payments} pagos en ${d.totals.cycles} ciclos`} />
        <Kpi label="Pagos verificables on-chain" value={String(onchainPayments)} hint={d.totals.simulated > 0 ? `${d.totals.simulated} simulados (sin transacción)` : "Todos con transacción en Celo"} />
        <Kpi label="Pagados en USD₮ por falta de liquidez" value={String(d.totals.fallbacks)} hint="Regla de respaldo con aviso a la fundación" />
        <Kpi label="Programas" value={String(d.programs.length)} hint={d.programs.map((p) => p.organization).join(" · ") || "—"} />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Identidad del agente</CardTitle>
          <CardDescription>Quién firma los pagos y cómo se atribuyen en Celo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Wallet del agente">{d.cfg.agentWallet ? <AddressLink address={d.cfg.agentWallet} chars={6} /> : "—"}</Info>
          <Info label="Red">Celo mainnet · chain id {CELO_CHAIN_ID}</Info>
          <Info label="Identidad ERC-8004">
            {identity.registered ? (
              <span className="inline-flex items-center gap-1.5">
                <Pill tone="ok">Registrada</Pill>
                {identity.agentId && <span className="tabular">agentId {identity.agentId}</span>}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Pill>Pendiente</Pill>
                <AddressLink address={ERC8004_IDENTITY_REGISTRY} />
              </span>
            )}
          </Info>
          <Info label="Atribución ERC-8021">{d.cfg.tagConfigured ? <Pill tone="ok">Etiqueta en cada transacción</Pill> : <Pill tone="warn">Etiqueta pendiente de configurar</Pill>}</Info>
        </CardContent>
      </Card>

      {d.totalsByToken.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Totales pagados por moneda</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {d.totalsByToken.map((t) => (
              <div key={t.token} className="rounded-lg bg-muted/60 px-3 py-2">
                <TokenMark token={t.token} className="text-xs text-muted-foreground" />
                <div className="font-semibold tabular text-ink">{formatNumber(t.amount, TOKENS[t.token].displayDecimals)}</div>
                <div className="text-[11px] text-muted-foreground">{t.count} pagos</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
          <CardDescription>Monto pedido por el programa y monto recibido por el becario, con su transacción.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.payments.length === 0 ? (
            <EmptyState icon={<Eye />} title="Sin pagos todavía">
              Cuando el agente ejecute su primer ciclo, cada pago aparecerá acá con su enlace a Celoscan.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Becario</TableHead>
                  <TableHead className="hidden lg:table-cell">Programa</TableHead>
                  <TableHead>Recibió</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Transacción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.payments.slice(0, 300).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs tabular">{formatDateTime(p.at)}</TableCell>
                    <TableCell>
                      <Link href={`/becario/${p.studentPublicId}`} className="font-mono text-xs text-primary hover:underline">
                        {p.studentPublicId}
                      </Link>
                      <div>
                        <AddressLink address={p.wallet} className="text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{p.programName}</TableCell>
                    <TableCell className="tabular">
                      {p.status === "failed" || p.status === "skipped" ? "—" : formatToken(p.paidAmount, p.paidToken)}
                      {p.paidToken !== p.requestedToken || p.status !== "paid" ? (
                        <div className="text-[11px] text-muted-foreground">pedido: {formatToken(p.requestedAmount, p.requestedToken)}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <PaymentPill status={p.status} />
                        {p.reason && <span className="max-w-56 text-[11px] text-muted-foreground">{p.reason}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{p.txHash ? <TxLink hash={p.txHash} /> : <SimPill simulated={p.simulated} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambios de moneda vía Textile</CardTitle>
          <CardDescription>Cada conversión entre USD₮ y wFIAT, con la tasa obtenida y la cantidad de órdenes.</CardDescription>
        </CardHeader>
        <CardContent>
          {d.swaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Entregó</TableHead>
                  <TableHead>Recibió</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Tasa</TableHead>
                  <TableHead className="text-right">Transacciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.swaps.slice(0, 200).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs tabular">{formatDateTime(s.at)}</TableCell>
                    <TableCell className="text-xs">{PURPOSE[s.purpose] ?? s.purpose}</TableCell>
                    <TableCell className="tabular">{formatToken(s.sellAmount, s.sellToken)}</TableCell>
                    <TableCell className="tabular">{formatToken(s.buyAmount, s.buyToken)}</TableCell>
                    <TableCell className="hidden text-right text-xs tabular md:table-cell">
                      {formatNumber(s.rate, s.rate > 100 ? 0 : 3)}
                      {s.chunks > 1 && <div className="text-[11px] text-muted-foreground">{s.chunks} órdenes</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.txHashes.length > 0 ? (
                        <div className="flex flex-col items-end gap-0.5">
                          {s.txHashes.map((h) => (
                            <TxLink key={h} hash={h} />
                          ))}
                        </div>
                      ) : (
                        <SimPill simulated={s.simulated} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {d.cfg.agentWallet && (
        <p className="text-center text-xs text-muted-foreground">
          <a href={`https://celoscan.io/address/${d.cfg.agentWallet}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
            Ver todas las transacciones del agente en Celoscan <ArrowUpRight className="size-3" />
          </a>
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold tabular text-ink">{value}</CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="line-clamp-2 text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

export const metadata = { title: "Auditoría pública · BecaPay" };
