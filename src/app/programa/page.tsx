import Link from "next/link";
import { ArrowUpRight, Pause, Pencil, Play, Plus, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActionButton } from "@/components/action-button";
import { CompositionBar } from "@/components/composition-bar";
import { CopyButton } from "@/components/copy-button";
import { ProgramSwitcher, StudentCoverageSelect } from "@/components/coverage-controls";
import { EmptyState } from "@/components/empty-state";
import { DepositForm } from "@/components/forms/deposit-form";
import { ProgramForm, type ProgramFormValues } from "@/components/forms/program-form";
import { StudentDialog } from "@/components/forms/student-dialog";
import { PageHeader } from "@/components/page-header";
import { MvpPill, Pill, SimPill, TokenMark } from "@/components/status";
import { AddressLink, TxLink } from "@/components/tx-link";
import {
  deleteProgramAction,
  deleteStudentAction,
  loadDemoAction,
  setActiveProgramAction,
  setStudentActiveAction,
  setStudentCoverageAction,
} from "@/app/actions";
import { defaultNextCycle, toLocalInputValue } from "@/lib/dates";
import { formatDateTime, formatNumber, formatToken, formatUsd } from "@/lib/format";
import { SELECTABLE_FIAT, TOKENS, rampUrl } from "@/lib/tokens";
import { loadProgramPage } from "@/lib/views";
import type { Program } from "@/lib/types";

export const dynamic = "force-dynamic";

function formValues(p?: Program): ProgramFormValues {
  if (!p) {
    return {
      name: "",
      organization: "",
      frequency: "monthly",
      nextCycleLocal: toLocalInputValue(defaultNextCycle()),
      cyclesPlanned: 12,
      lowCoverageCycles: 2,
      coverageEnabled: true,
      autoRun: true,
    };
  }
  return {
    id: p.id,
    name: p.name,
    organization: p.organization,
    frequency: p.frequency,
    nextCycleLocal: toLocalInputValue(p.nextCycleAt),
    cyclesPlanned: p.cyclesPlanned,
    lowCoverageCycles: p.lowCoverageCycles,
    coverageEnabled: p.coverageEnabled,
    autoRun: p.autoRun,
  };
}

export default async function ProgramPage() {
  const d = await loadProgramPage();
  const { program, cfg } = d;

  if (!program) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          eyebrow="Nuevo programa"
          title="Crear un programa de becas"
          description="Definí la frecuencia de pago y si querés proteger la caja en USD₮. Después sumás a los becarios y fondeás."
          actions={
            <ActionButton variant="outline" action={loadDemoAction} pendingLabel="Cargando…">
              Cargar demo
            </ActionButton>
          }
        />
        <Card>
          <CardContent>
            <ProgramForm mode="create" values={formValues()} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const agentWallet = cfg.agentWallet;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={program.organization}
        title={program.name}
        description="Becarios, fondeo y reglas del programa."
        actions={<ProgramSwitcher programs={d.programs} activeId={program.id} action={setActiveProgramAction} />}
      />

      <Tabs defaultValue="becarios" className="gap-4">
        <TabsList>
          <TabsTrigger value="becarios">Becarios ({d.students.length})</TabsTrigger>
          <TabsTrigger value="fondeo">Fondeo</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="becarios">
          <Card>
            <CardHeader>
              <CardTitle>Becarios del programa</CardTitle>
              <CardDescription>Cada becario cobra un monto fijo en su moneda. El nombre es privado; en la auditoría solo se ve su id público.</CardDescription>
              <CardAction>
                <StudentDialog
                  programId={program.id}
                  trigger={
                    <Button size="sm">
                      <Plus /> Agregar becario
                    </Button>
                  }
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              {d.students.length === 0 ? (
                <EmptyState icon={<UserRound />} title="Sin becarios todavía">
                  Monedas recomendadas hoy: {SELECTABLE_FIAT.filter((s) => TOKENS[s].mvp === "recommended").map((s) => TOKENS[s].display).join(" y ")}. wPEN y wCLP no tienen corredor en Textile.
                </EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Becario</TableHead>
                      <TableHead>Cobra por ciclo</TableHead>
                      <TableHead className="hidden lg:table-cell">Wallet</TableHead>
                      <TableHead>Cobertura</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.students.map((s) => (
                      <TableRow key={s.id} className={s.active ? undefined : "opacity-60"}>
                        <TableCell>
                          <div className="flex items-center gap-2 font-medium text-ink">
                            {s.displayName}
                            {!s.active && <Pill>Pausado</Pill>}
                            {s.demo && <Pill>Demo</Pill>}
                          </div>
                          <Link href={`/becario/${s.publicId}`} className="font-mono text-[11px] text-muted-foreground hover:text-primary">
                            {s.publicId} · ver como becario
                          </Link>
                        </TableCell>
                        <TableCell className="tabular">
                          <div>{formatToken(s.amount, s.currency)}</div>
                          <MvpPill status={TOKENS[s.currency].mvp} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <AddressLink address={s.wallet} />
                        </TableCell>
                        <TableCell>
                          <StudentCoverageSelect
                            value={s.coverage}
                            label={`Cobertura de ${s.publicId}`}
                            action={setStudentCoverageAction.bind(null, s.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <StudentDialog
                              programId={program.id}
                              values={{ id: s.id, displayName: s.displayName, wallet: s.wallet, currency: s.currency, amount: s.amount, coverage: s.coverage }}
                              trigger={
                                <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.publicId}`}>
                                  <Pencil />
                                </Button>
                              }
                            />
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              action={setStudentActiveAction.bind(null, s.id, !s.active)}
                              icon={s.active ? <Pause /> : <Play />}
                            >
                              <span className="sr-only">{s.active ? "Pausar" : "Reactivar"}</span>
                            </ActionButton>
                            <ActionButton
                              variant="ghost"
                              size="icon-sm"
                              action={deleteStudentAction.bind(null, s.id)}
                              icon={<Trash2 />}
                              confirm={{
                                title: `¿Quitar a ${s.displayName}?`,
                                description: "Si ya cobró alguna vez, queda pausado para conservar el historial de pagos.",
                                confirmLabel: "Quitar",
                                destructive: true,
                              }}
                            >
                              <span className="sr-only">Quitar</span>
                            </ActionButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fondeo" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Caja {d.treasury.source === "simulado" ? "simulada" : "on-chain"}</CardTitle>
                <CardDescription>
                  {d.treasury.source === "simulado"
                    ? "En simulación, los fondeos se suman acá. No se mueve dinero real."
                    : "Saldo real de la wallet del agente en Celo mainnet."}
                </CardDescription>
                <CardAction>
                  <span className="text-lg font-semibold tabular text-ink">{formatUsd(d.treasury.totalUsd)}</span>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                <CompositionBar rows={d.treasury.rows} showLegend={false} />
                {d.treasury.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">La caja está vacía.</p>
                ) : (
                  <Table>
                    <TableBody>
                      {d.treasury.rows.map((r) => (
                        <TableRow key={r.token}>
                          <TableCell>
                            <TokenMark token={r.token} />
                          </TableCell>
                          <TableCell className="text-right tabular">{formatNumber(r.amount, TOKENS[r.token].displayDecimals)}</TableCell>
                          <TableCell className="text-right text-muted-foreground tabular">{r.usd !== undefined ? formatUsd(r.usd) : "sin precio"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Registrar fondeo</CardTitle>
                <CardDescription>
                  {cfg.dryRun
                    ? "Sumá fondos de prueba en cualquier moneda para simular el ciclo."
                    : "Enviá USD₮ o wFIAT a la wallet del agente y registralo acá para la contabilidad."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DepositForm programId={program.id} dryRun={cfg.dryRun} />
              </CardContent>
            </Card>
          </div>

          {agentWallet && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Fondear on-chain</CardTitle>
                <CardDescription>
                  Wallet del agente (Celo mainnet): <span className="font-mono text-ink">{agentWallet}</span> <CopyButton value={agentWallet} label="Copiar wallet" />
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {SELECTABLE_FIAT.map((s) => (
                  <Button key={s} asChild variant="outline" size="sm">
                    <a href={rampUrl(s, agentWallet)} target="_blank" rel="noreferrer">
                      Comprar {TOKENS[s].display} con Ripio <ArrowUpRight />
                    </a>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historial de fondeos</CardTitle>
            </CardHeader>
            <CardContent>
              {d.deposits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin fondeos registrados.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Monto</TableHead>
                      <TableHead className="hidden sm:table-cell">Nota</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Transacción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.deposits.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell className="text-xs tabular">{formatDateTime(x.at)}</TableCell>
                        <TableCell className="tabular">{formatToken(x.amount, x.token)}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{x.note ?? "—"}</TableCell>
                        <TableCell>
                          <SimPill simulated={x.simulated} />
                        </TableCell>
                        <TableCell className="text-right">
                          <TxLink hash={x.txHash} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reglas del programa</CardTitle>
              <CardDescription>El agente ejecuta estas reglas; la organización decide quién cobra y cuánto.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgramForm key={program.id} mode="edit" values={formValues(program)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crear otro programa</CardTitle>
              <CardDescription>Cada programa tiene su propia caja, becarios y calendario.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgramForm mode="create" values={formValues()} />
            </CardContent>
          </Card>

          <Card size="sm" className="ring-destructive/20">
            <CardHeader>
              <CardTitle>Borrar programa</CardTitle>
              <CardDescription>Elimina el programa y su historial local. Si tiene pagos reales on-chain, no se puede borrar.</CardDescription>
              <CardAction>
                <ActionButton
                  variant="destructive"
                  size="sm"
                  action={deleteProgramAction.bind(null, program.id)}
                  confirm={{
                    title: `¿Borrar «${program.name}»?`,
                    description: "Se borran becarios, ciclos y bitácora de este programa en esta app. Las transacciones on-chain no se pueden borrar.",
                    confirmLabel: "Borrar programa",
                    destructive: true,
                  }}
                >
                  Borrar
                </ActionButton>
              </CardAction>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
