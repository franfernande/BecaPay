import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CircleCheck,
  Droplets,
  ExternalLink,
  FlaskConical,
  Play,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/action-button";
import { CompositionBar, ProgressLine } from "@/components/composition-bar";
import { CoverageSwitch, ProgramSwitcher } from "@/components/coverage-controls";
import { EmptyState } from "@/components/empty-state";
import { LogList } from "@/components/log-list";
import { PageHeader } from "@/components/page-header";
import { LiquidityPill, PaymentPill, Pill, TokenMark } from "@/components/status";
import { AddressLink, TxLink } from "@/components/tx-link";
import {
  loadDemoAction,
  protectNowAction,
  resolveAlertAction,
  runCycleAction,
  runPrecheckAction,
  setActiveProgramAction,
  setProgramCoverageAction,
} from "@/app/actions";
import { effectiveCoverage } from "@/lib/agent/common";
import { formatDate, formatDateTime, formatNumber, formatPercent, formatRelativeDays, formatToken, formatUsd } from "@/lib/format";
import { TOKENS } from "@/lib/tokens";
import { loadDashboard, type DashboardData } from "@/lib/views";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FREQ: Record<string, string> = { monthly: "mensual", biweekly: "quincenal", weekly: "semanal" };

export default async function DashboardPage() {
  const d = await loadDashboard();
  if (!d.program) return <Welcome d={d} />;
  const { program, cfg } = d;
  const active = d.students.filter((s) => s.active);
  const lowRunway = d.runway !== undefined && d.runway < program.lowCoverageCycles;
  const runwayTone = d.runway === undefined ? "primary" : lowRunway ? "warning" : "success";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={program.organization}
        title={program.name}
        description={`Pago ${FREQ[program.frequency]} a ${active.length} ${active.length === 1 ? "becario" : "becarios"}, cada uno en su moneda local.`}
        actions={
          <>
            <ProgramSwitcher programs={d.programs} activeId={program.id} action={setActiveProgramAction} />
            <ActionButton
              variant="outline"
              icon={<Droplets />}
              action={runPrecheckAction.bind(null, program.id)}
              pendingLabel="Consultando Textile…"
            >
              Revisar liquidez
            </ActionButton>
            <ActionButton
              icon={<Play />}
              action={runCycleAction.bind(null, program.id)}
              pendingLabel="Ejecutando ciclo…"
              disabled={active.length === 0}
              confirm={
                cfg.dryRun
                  ? undefined
                  : {
                      title: "¿Ejecutar el ciclo en mainnet?",
                      description: (
                        <>
                          <p>El agente va a firmar y enviar transacciones reales en Celo (pagos y cambios vía Textile).</p>
                          <p>Tope de USD₮ por ciclo: {formatUsd(cfg.maxUsdtPerCycle, 0)}.</p>
                        </>
                      ),
                      confirmLabel: "Sí, pagar ahora",
                    }
              }
            >
              Correr ciclo
            </ActionButton>
          </>
        }
      />

      {cfg.dryRun && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-soft/60 px-4 py-3 text-[13px] text-[oklch(0.4_0.08_70)]">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-medium">Simulación.</span> Las cotizaciones son reales (Textile, Celo mainnet) pero el agente no firma ni envía
            transacciones. La caja de abajo es simulada; el saldo real de la wallet del agente está al final de la página.
          </p>
        </div>
      )}

      {d.alerts.length > 0 && (
        <div className="grid gap-2">
          {d.alerts.slice(0, 4).map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center",
                a.severity === "critical" ? "border-destructive/25 bg-danger-soft" : a.severity === "warning" ? "border-warning/30 bg-warning-soft/70" : "bg-card",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink">{a.title}</div>
                <p className="text-[13px] text-muted-foreground">{a.message}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {a.rampUrl && (
                  <Button asChild size="sm">
                    <a href={a.rampUrl} target="_blank" rel="noreferrer">
                      Recargar con Ripio <ArrowUpRight />
                    </a>
                  </Button>
                )}
                <ActionButton size="sm" variant="ghost" action={resolveAlertAction.bind(null, a.id)}>
                  Marcar resuelta
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Caja del programa</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular text-ink">{formatUsd(d.treasury.totalUsd)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CompositionBar rows={d.treasury.rows} />
            {d.treasury.rows.length === 0 && <p className="text-xs text-muted-foreground">Sin fondos todavía. Cargá un fondeo en Programa.</p>}
            <p className="text-[11px] text-muted-foreground">{d.treasury.source === "simulado" ? "Caja simulada" : "Saldo on-chain de la wallet del agente"} · valuada en USD₮</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Próximo pago</CardDescription>
            <CardTitle className="text-2xl font-semibold text-ink">{formatDate(program.nextCycleAt)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ProgressLine value={d.nextProgress} />
            <p className="text-xs text-muted-foreground">
              {formatRelativeDays(program.nextCycleAt)} · {formatUsd(d.perCycleUsd, 0)} por ciclo
              {program.autoRun ? " · automático" : " · manual"}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Pagado a becarios</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular text-ink">{formatUsd(d.paidUsd)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ProgressLine value={program.cyclesPlanned ? program.cyclesCompleted / program.cyclesPlanned : 0} tone="success" />
            <p className="text-xs text-muted-foreground">
              Ciclo {program.cyclesCompleted} de {program.cyclesPlanned} · {d.paymentsCount} pagos
              {d.fallbackCount > 0 ? ` · ${d.fallbackCount} en USD₮` : ""}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Salud de la caja</CardDescription>
            <CardTitle className="text-2xl font-semibold text-ink">
              {d.runway === undefined ? "—" : `${formatNumber(Math.floor(d.runway * 10) / 10, 1)} ciclos`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ProgressLine value={d.runway === undefined ? 0 : d.runway / Math.max(program.cyclesPlanned - program.cyclesCompleted, 1)} tone={runwayTone} />
            <p className="text-xs text-muted-foreground">
              {d.runway === undefined
                ? "Agregá becarios para calcular la cobertura."
                : lowRunway
                  ? `Por debajo del umbral de ${program.lowCoverageCycles} ciclos: conviene recargar.`
                  : `Cubre los próximos pagos. Presupuesto total ${formatUsd(d.budgetUsd, 0)}.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Becarios</CardTitle>
            <CardDescription>Monto fijo por ciclo, moneda de cobro y liquidez disponible en Textile.</CardDescription>
            <CardAction>
              <Button asChild variant="outline" size="sm">
                <Link href="/programa">Gestionar</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {d.students.length === 0 ? (
              <EmptyState
                title="Todavía no hay becarios"
                actions={
                  <Button asChild size="sm">
                    <Link href="/programa">
                      <Plus /> Agregar becario
                    </Link>
                  </Button>
                }
              >
                Sumá a cada becario con su wallet de Celo, su moneda y el monto fijo que cobra.
              </EmptyState>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Becario</TableHead>
                    <TableHead>Cobra</TableHead>
                    <TableHead className="hidden md:table-cell">Cobertura</TableHead>
                    <TableHead>Liquidez</TableHead>
                    <TableHead className="hidden sm:table-cell">Último pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.students.map((s) => {
                    const liq = d.liquidity.currencies.find((c) => c.token === s.currency);
                    const last = d.lastPaymentByStudent[s.id];
                    return (
                      <TableRow key={s.id} className={cn(!s.active && "opacity-55")}>
                        <TableCell>
                          <div className="font-medium text-ink">{s.displayName}</div>
                          <Link href={`/becario/${s.publicId}`} className="font-mono text-[11px] text-muted-foreground hover:text-primary">
                            {s.publicId}
                          </Link>
                        </TableCell>
                        <TableCell className="tabular">
                          <div>{formatToken(s.amount, s.currency)}</div>
                          <div className="text-[11px] text-muted-foreground">{TOKENS[s.currency].countryName}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {effectiveCoverage(program, s) ? <Pill tone="info">En USD₮</Pill> : <Pill>En moneda local</Pill>}
                        </TableCell>
                        <TableCell>{!s.active ? <Pill>Pausado</Pill> : liq ? <LiquidityPill status={liq.status} /> : <Pill>—</Pill>}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {last ? (
                            <div className="space-y-0.5">
                              <PaymentPill status={last.status} />
                              <div className="text-[11px] text-muted-foreground">{formatDate(last.at)}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sin pagos aún</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cobertura en USD₮</CardTitle>
            <CardDescription>Protege el saldo ocioso de la devaluación. Se puede cambiar por becario.</CardDescription>
            <CardAction>
              <CoverageSwitch enabled={program.coverageEnabled} action={setProgramCoverageAction.bind(null, program.id)} />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-[11px] text-muted-foreground">Resultado de la cobertura</div>
                <div className={cn("text-lg font-semibold tabular", d.pnl.pnlUsd >= 0 ? "text-success" : "text-destructive")}>
                  {d.pnl.pnlUsd >= 0 ? "+" : "−"}
                  {formatUsd(Math.abs(d.pnl.pnlUsd))}
                </div>
                <div className="text-[11px] text-muted-foreground tabular">
                  {d.pnl.lots > 0 ? `${formatPercent(d.pnl.pnlPct)} sobre ${formatUsd(d.pnl.hedgedLocalUsd, 0)}` : "Sin coberturas aún"}
                </div>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-[11px] text-muted-foreground">Protegido en USD₮</div>
                <div className="text-lg font-semibold tabular text-ink">{formatUsd(d.pnl.hedgedUsdt, 0)}</div>
                <div className="text-[11px] text-muted-foreground">{d.pnl.lots} {d.pnl.lots === 1 ? "conversión" : "conversiones"}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-[12px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Cotizaciones Textile</span>
                <span className="tabular text-ink">
                  {d.textile.previews + d.textile.firmQuotes} · {formatUsd(d.textile.quotedNotionalUsdt, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Ejecutadas</span>
                <span className="tabular text-ink">
                  {d.textile.fills} · {formatUsd(d.textile.filledNotionalUsdt, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sin cotización (no_quote)</span>
                <span className="tabular text-ink">{d.textile.noQuotes}</span>
              </div>
            </div>
            <ActionButton
              variant="outline"
              size="sm"
              className="w-full"
              action={protectNowAction.bind(null, program.id)}
              pendingLabel="Cotizando…"
              disabled={!d.students.some((s) => s.active && effectiveCoverage(program, s)) && !program.coverageEnabled}
            >
              Proteger excedente ahora
            </ActionButton>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <LastCycleCard d={d} />
        <Card>
          <CardHeader>
            <CardTitle>Decisiones del agente</CardTitle>
            <CardDescription>Qué hizo y por qué, en palabras simples.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/bitacora">Ver todo</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {d.log.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay decisiones registradas.</p>
            ) : (
              <LogList entries={d.log.slice(0, 6)} compact />
            )}
          </CardContent>
        </Card>
      </div>

      <AgentWalletCard d={d} />
    </div>
  );
}

function LastCycleCard({ d }: { d: DashboardData }) {
  const c = d.lastCycle;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Último ciclo</CardTitle>
        <CardDescription>{c ? `${formatDateTime(c.startedAt)} · ${c.trigger === "manual" ? "ejecutado a mano" : "programado"}` : "Aún no se ejecutó ningún ciclo."}</CardDescription>
        {c && (
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/bitacora?ciclo=${c.id}`}>Detalle</Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!c ? (
          <EmptyState icon={<CalendarClock />} title="Listo para el primer pago" className="py-8">
            Con “Correr ciclo” el agente revisa liquidez en Textile, cambia lo necesario y paga a cada becario en su moneda.
          </EmptyState>
        ) : (
          <>
            {c.status === "completed" && (
              <div className="flex items-center gap-2 text-[13px] text-success">
                <CircleCheck className="size-4" />
                <span>
                  Todos los becarios activos cobraron este ciclo.
                  {d.streak > 1 && <span className="text-muted-foreground"> {d.streak} ciclos seguidos sin pendientes.</span>}
                </span>
              </div>
            )}
            {c.summary && <p className="text-[13px] text-muted-foreground">{c.summary}</p>}
            {d.lastPayments.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Becario</TableHead>
                    <TableHead>Recibió</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Transacción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.lastPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.studentPublicId}</TableCell>
                      <TableCell className="tabular">
                        {formatToken(p.paidAmount, p.paidToken)}
                        {p.status === "fallback" && (
                          <div className="text-[11px] text-muted-foreground">pedía {formatToken(p.requestedAmount, p.requestedToken)}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <PaymentPill status={p.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {p.txHash ? <TxLink hash={p.txHash} /> : <span className="text-[11px] text-muted-foreground">{p.simulated ? "simulado, sin firma" : "—"}</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AgentWalletCard({ d }: { d: DashboardData }) {
  const rows = d.onchainView.rows;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" /> Wallet del agente en Celo mainnet
        </CardTitle>
        <CardDescription>Saldo real leído de la red. Es la fuente de verdad para los pagos en vivo.</CardDescription>
        <CardAction>{d.cfg.agentWallet && <AddressLink address={d.cfg.agentWallet} chars={6} />}</CardAction>
      </CardHeader>
      <CardContent>
        {d.onchain.error ? (
          <p className="text-[13px] text-destructive">{d.onchain.error}</p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            <span>
              <span className="text-muted-foreground">CELO (gas) </span>
              <span className="tabular font-medium text-ink">{formatNumber(d.onchain.celo, 4)}</span>
            </span>
            {rows.length === 0 ? (
              <span className="text-muted-foreground">Sin USD₮ ni wFIAT todavía.</span>
            ) : (
              rows.map((r) => (
                <span key={r.token} className="inline-flex items-center gap-1.5">
                  <TokenMark token={r.token} className="text-muted-foreground" />
                  <span className="tabular font-medium text-ink">{formatNumber(r.amount, TOKENS[r.token].displayDecimals)}</span>
                </span>
              ))
            )}
            {d.onchain.celo === 0 && (
              <span className="text-[12px] text-[oklch(0.45_0.1_70)]">Necesita CELO o USD₮ para pagar gas antes del modo en vivo.</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Welcome({ d }: { d: DashboardData }) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BecaPay"
        title="Becas que llegan completas, en la moneda de cada estudiante"
        description="Un agente en Celo que paga becas en pesos, reales o soles on-chain (wFIAT de Ripio), protege la caja en USD₮ y deja cada pago auditable."
      />
      <EmptyState
        icon={<Sparkles />}
        title="Empezá creando un programa de becas"
        actions={
          <>
            <Button asChild>
              <Link href="/programa">
                <Plus /> Crear programa
              </Link>
            </Button>
            <ActionButton variant="outline" action={loadDemoAction} pendingLabel="Cargando…">
              Cargar demo
            </ActionButton>
          </>
        }
      >
        La demo crea una fundación con cuatro becarios en Colombia, Brasil, Argentina y México, y una caja simulada fondeada en USD₮ y wARS.
      </EmptyState>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          ["1. Fondeás en cualquier moneda", "USD₮ o wFIAT. Con Ripio Ramp se carga desde pesos o reales."],
          ["2. El agente paga en la fecha", "Revisa la liquidez en Textile el día anterior y cambia lo justo para cada becario."],
          ["3. Todo queda auditable", "Cada pago y cambio tiene su transacción en Celoscan y una explicación en la bitácora."],
        ].map(([t, b]) => (
          <Card key={t} size="sm">
            <CardHeader>
              <CardTitle className="text-sm">{t}</CardTitle>
              <CardDescription>{b}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <AgentWalletCard d={d} />
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/auditoria" className="inline-flex items-center gap-1 hover:text-primary">
          Ver la vista pública de auditoría <ExternalLink className="size-3" />
        </Link>
      </p>
    </div>
  );
}
