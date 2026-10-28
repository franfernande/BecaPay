"use server";

import { revalidatePath } from "next/cache";
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { mutate, newId, newPublicId, nowIso } from "@/lib/store";
import { SELECTABLE_FIAT, ALL_TOKENS, TOKENS } from "@/lib/tokens";
import type { FiatSymbol, Frequency, TokenSymbol } from "@/lib/types";
import { makeLogger } from "@/lib/agent/common";
import { prepareNextCycle, protectNow, runCycle, runPrecheck } from "@/lib/agent/cycle";
import { loadDemo } from "@/lib/agent/demo";
import { registerIdentity } from "@/lib/celo/identity";
import { preview, reasonEs } from "@/lib/textile/client";
import { formatNumber, formatToken } from "@/lib/format";

export interface ActionState {
  ok: boolean;
  message: string;
}

const done = (r: ActionState): ActionState => {
  revalidatePath("/", "layout");
  return r;
};

const mode = () => (getConfig().dryRun ? "dry_run" : "live") as "dry_run" | "live";

const amountSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\./g, "").replace(",", "."))
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) > 0, "Ingresá un monto mayor a cero (ej. 350000 o 600,50).");

const programSchema = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 letras.").max(80),
  organization: z.string().trim().min(2, "Indicá la organización.").max(80),
  frequency: z.enum(["monthly", "biweekly", "weekly"]),
  nextCycleAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Fecha inválida."),
  cyclesPlanned: z.coerce.number().int().min(1).max(120),
  lowCoverageCycles: z.coerce.number().int().min(1).max(24),
  coverageEnabled: z.boolean(),
  autoRun: z.boolean(),
});

function readProgramForm(fd: FormData) {
  return programSchema.safeParse({
    name: fd.get("name"),
    organization: fd.get("organization"),
    frequency: fd.get("frequency") ?? "monthly",
    nextCycleAt: fd.get("nextCycleAt"),
    cyclesPlanned: fd.get("cyclesPlanned") ?? 12,
    lowCoverageCycles: fd.get("lowCoverageCycles") ?? 2,
    coverageEnabled: fd.get("coverageEnabled") === "on" || fd.get("coverageEnabled") === "true",
    autoRun: fd.get("autoRun") === "on" || fd.get("autoRun") === "true",
  });
}

export async function createProgramAction(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const parsed = readProgramForm(fd);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  await mutate((db) => {
    const id = newId("prg");
    db.programs.push({
      id,
      name: v.name,
      organization: v.organization,
      coverageEnabled: v.coverageEnabled,
      frequency: v.frequency as Frequency,
      nextCycleAt: new Date(v.nextCycleAt).toISOString(),
      autoRun: v.autoRun,
      cyclesPlanned: v.cyclesPlanned,
      cyclesCompleted: 0,
      lowCoverageCycles: v.lowCoverageCycles,
      createdAt: nowIso(),
      demo: false,
    });
    db.activeProgramId = id;
    makeLogger(db, id, undefined, mode()).info("config", `Programa «${v.name}» creado`, `Cobertura USD₮ ${v.coverageEnabled ? "activada" : "apagada"}. Ciclos ${v.frequency === "monthly" ? "mensuales" : v.frequency === "biweekly" ? "quincenales" : "semanales"}.`);
  });
  return done({ ok: true, message: "Programa creado. Ahora sumá becarios." });
}

export async function updateProgramAction(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id") ?? "");
  const parsed = readProgramForm(fd);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const r = await mutate((db) => {
    const p = db.programs.find((x) => x.id === id);
    if (!p) return false;
    Object.assign(p, {
      name: v.name,
      organization: v.organization,
      frequency: v.frequency,
      nextCycleAt: new Date(v.nextCycleAt).toISOString(),
      cyclesPlanned: Math.max(v.cyclesPlanned, p.cyclesCompleted),
      lowCoverageCycles: v.lowCoverageCycles,
      coverageEnabled: v.coverageEnabled,
      autoRun: v.autoRun,
    });
    makeLogger(db, id, undefined, mode()).info("config", "Configuración del programa actualizada", `Próximo ciclo: ${new Date(p.nextCycleAt).toLocaleString("es-AR")}. Ciclos programados ${v.autoRun ? "activados" : "desactivados"}.`);
    return true;
  });
  return done(r ? { ok: true, message: "Cambios guardados." } : { ok: false, message: "Programa no encontrado." });
}

export async function setActiveProgramAction(id: string): Promise<ActionState> {
  await mutate((db) => {
    if (db.programs.some((p) => p.id === id)) db.activeProgramId = id;
  });
  return done({ ok: true, message: "Programa activo cambiado." });
}

export async function deleteProgramAction(id: string): Promise<ActionState> {
  const r = await mutate((db) => {
    const p = db.programs.find((x) => x.id === id);
    if (!p) return { ok: false, message: "Programa no encontrado." };
    if (!p.demo && db.payments.some((x) => x.programId === id && !x.simulated)) {
      return { ok: false, message: "Este programa tiene pagos reales: no se puede borrar (la trazabilidad debe quedar)." };
    }
    db.programs = db.programs.filter((x) => x.id !== id);
    db.students = db.students.filter((x) => x.programId !== id);
    db.deposits = db.deposits.filter((x) => x.programId !== id);
    db.cycles = db.cycles.filter((x) => x.programId !== id);
    db.payments = db.payments.filter((x) => x.programId !== id);
    db.swaps = db.swaps.filter((x) => x.programId !== id);
    db.alerts = db.alerts.filter((x) => x.programId !== id);
    db.hedgeLots = db.hedgeLots.filter((x) => x.programId !== id);
    db.log = db.log.filter((x) => x.programId !== id);
    delete db.ledger[id];
    delete db.prechecks[id];
    if (db.activeProgramId === id) db.activeProgramId = db.programs[0]?.id;
    return { ok: true, message: `Programa «${p.name}» borrado.` };
  });
  return done(r);
}

export async function setProgramCoverageAction(programId: string, enabled: boolean): Promise<ActionState> {
  await mutate((db) => {
    const p = db.programs.find((x) => x.id === programId);
    if (!p) return;
    p.coverageEnabled = enabled;
    makeLogger(db, programId, undefined, mode()).info(
      "cobertura",
      `Cobertura USD₮ ${enabled ? "activada" : "apagada"} para el programa`,
      enabled
        ? "En el próximo ciclo convierto el excedente de moneda local a USD₮ y guardo solo el buffer de los próximos pagos."
        : "La caja queda en las monedas fondeadas; solo cambio lo necesario al pagar.",
    );
  });
  return done({ ok: true, message: enabled ? "Cobertura en dólares activada." : "Cobertura en dólares apagada." });
}

const studentSchema = z.object({
  displayName: z.string().trim().min(2, "Escribí el nombre del becario.").max(80),
  wallet: z
    .string()
    .trim()
    .refine((v) => isAddress(v), "La wallet no es una dirección válida de Celo (0x… con 40 caracteres)."),
  currency: z.enum(SELECTABLE_FIAT as [FiatSymbol, ...FiatSymbol[]]),
  amount: amountSchema,
  coverage: z.enum(["inherit", "on", "off"]),
});

export async function addStudentAction(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const programId = String(fd.get("programId") ?? "");
  const parsed = studentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const r = await mutate((db) => {
    const p = db.programs.find((x) => x.id === programId);
    if (!p) return { ok: false, message: "Programa no encontrado." };
    const wallet = getAddress(v.wallet);
    if (getConfig().agentWallet && wallet.toLowerCase() === getConfig().agentWallet!.toLowerCase()) {
      return { ok: false, message: "Esa es la wallet del agente: el becario necesita su propia wallet." };
    }
    const publicId = newPublicId(new Set(db.students.map((s) => s.publicId)));
    db.students.push({
      id: newId("stu"),
      programId,
      publicId,
      displayName: v.displayName,
      wallet,
      currency: v.currency,
      amount: v.amount,
      coverage: v.coverage,
      active: true,
      demo: false,
      createdAt: nowIso(),
    });
    makeLogger(db, programId, undefined, mode()).info(
      "config",
      `Becario ${publicId} agregado`,
      `Cobra ${formatToken(Number(v.amount), v.currency)} por ciclo. La organización define la elegibilidad; el agente solo ejecuta.`,
    );
    return { ok: true, message: `Becario agregado con id público ${publicId}.` };
  });
  return done(r);
}

export async function updateStudentAction(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const id = String(fd.get("id") ?? "");
  const parsed = studentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const r = await mutate((db) => {
    const s = db.students.find((x) => x.id === id);
    if (!s) return { ok: false, message: "Becario no encontrado." };
    Object.assign(s, { displayName: v.displayName, wallet: getAddress(v.wallet), currency: v.currency, amount: v.amount, coverage: v.coverage });
    makeLogger(db, s.programId, undefined, mode()).info("config", `Datos de ${s.publicId} actualizados`, `Monto fijo: ${formatToken(Number(v.amount), v.currency)}.`);
    return { ok: true, message: "Becario actualizado." };
  });
  return done(r);
}

export async function setStudentCoverageAction(id: string, coverage: "inherit" | "on" | "off"): Promise<ActionState> {
  await mutate((db) => {
    const s = db.students.find((x) => x.id === id);
    if (!s) return;
    s.coverage = coverage;
    const label = coverage === "inherit" ? "usa la regla del programa" : coverage === "on" ? "protegida en USD₮" : "queda en moneda local";
    makeLogger(db, s.programId, undefined, mode()).info("cobertura", `Cobertura de ${s.publicId}: ${label}`);
  });
  return done({ ok: true, message: "Cobertura del becario actualizada." });
}

export async function setStudentActiveAction(id: string, active: boolean): Promise<ActionState> {
  await mutate((db) => {
    const s = db.students.find((x) => x.id === id);
    if (!s) return;
    s.active = active;
    makeLogger(db, s.programId, undefined, mode()).info("config", `${s.publicId} ${active ? "reactivado" : "pausado"}`, active ? "Vuelve a cobrar desde el próximo ciclo." : "No cobra en los próximos ciclos hasta que la organización lo reactive.");
  });
  return done({ ok: true, message: active ? "Becario reactivado." : "Becario pausado." });
}

export async function deleteStudentAction(id: string): Promise<ActionState> {
  const r = await mutate((db) => {
    const s = db.students.find((x) => x.id === id);
    if (!s) return { ok: false, message: "Becario no encontrado." };
    if (db.payments.some((p) => p.studentId === id)) {
      s.active = false;
      return { ok: true, message: "Tiene pagos registrados: lo pausé en lugar de borrarlo." };
    }
    db.students = db.students.filter((x) => x.id !== id);
    return { ok: true, message: "Becario eliminado." };
  });
  return done(r);
}

const depositSchema = z.object({
  token: z.enum(ALL_TOKENS as [TokenSymbol, ...TokenSymbol[]]),
  amount: amountSchema,
  txHash: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^0x[0-9a-fA-F]{64}$/.test(v), "El hash de transacción no es válido."),
  note: z.string().trim().max(120).optional(),
});

export async function addDepositAction(_: ActionState | null, fd: FormData): Promise<ActionState> {
  const programId = String(fd.get("programId") ?? "");
  const parsed = depositSchema.safeParse({
    token: fd.get("token"),
    amount: fd.get("amount"),
    txHash: fd.get("txHash") || undefined,
    note: fd.get("note") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  const dry = getConfig().dryRun;
  const r = await mutate((db) => {
    if (!db.programs.some((p) => p.id === programId)) return { ok: false, message: "Programa no encontrado." };
    db.deposits.push({ id: newId("dep"), programId, token: v.token, amount: v.amount, at: nowIso(), simulated: dry, txHash: v.txHash, note: v.note });
    if (dry) {
      const ledger = (db.ledger[programId] ??= {});
      const dec = TOKENS[v.token].decimals;
      const current = ledger[v.token] ? parseUnits(ledger[v.token]!, dec) : 0n;
      ledger[v.token] = formatUnits(current + parseUnits(v.amount, dec), dec);
    }
    makeLogger(db, programId, undefined, dry ? "dry_run" : "live").info(
      "fondeo",
      `Fondeo registrado: ${formatToken(Number(v.amount), v.token)}`,
      dry
        ? "Modo simulación: sumé el monto a la caja simulada del programa."
        : "Modo en vivo: la caja real es el saldo on-chain de la wallet del agente; este registro es contable.",
    );
    return { ok: true, message: dry ? "Fondeo simulado agregado a la caja." : "Fondeo registrado (el saldo real se lee de la red)." };
  });
  return done(r);
}

export async function runCycleAction(programId: string): Promise<ActionState> {
  return done(await runCycle(programId, "manual"));
}

export async function runPrecheckAction(programId: string): Promise<ActionState> {
  const r = await runPrecheck(programId);
  return done({ ok: r.ok, message: r.message });
}

export async function prepareCycleAction(programId: string): Promise<ActionState> {
  return done(await prepareNextCycle(programId));
}

export async function protectNowAction(programId: string): Promise<ActionState> {
  return done(await protectNow(programId));
}

export async function loadDemoAction(): Promise<ActionState> {
  return done(await loadDemo());
}

export async function resolveAlertAction(id: string): Promise<ActionState> {
  await mutate((db) => {
    const a = db.alerts.find((x) => x.id === id);
    if (a) a.resolved = true;
  });
  return done({ ok: true, message: "Alerta marcada como resuelta." });
}

export async function registerIdentityAction(): Promise<ActionState> {
  return done(await registerIdentity());
}

export interface QuoteState extends ActionState {
  quote?: { sell: string; buy: string; fee: string; rate: string; chunksHint?: string };
}

export async function previewQuoteAction(_: QuoteState | null, fd: FormData): Promise<QuoteState> {
  const token = fd.get("token") as FiatSymbol;
  const direction = fd.get("direction") === "hedge" ? "hedge" : "payout";
  const amount = amountSchema.safeParse(fd.get("amount"));
  if (!TOKENS[token] || token === ("USDT" as string)) return { ok: false, message: "Elegí una moneda." };
  if (!amount.success) return { ok: false, message: amount.error.issues[0].message };
  const local = parseUnits(amount.data, TOKENS[token].decimals);
  const r =
    direction === "payout"
      ? await preview({ sell: "USDT", buy: token, buyAmount: local })
      : await preview({ sell: token, buy: "USDT", sellAmount: local });
  await mutate((db) => {
    db.textile.previews += 1;
    if (r.status !== "preview") db.textile.noQuotes += 1;
  });
  if (r.status === "preview") {
    const usdt = Number(direction === "payout" ? r.takerPays : r.buyAmount) / 1e6;
    const loc = Number(amount.data);
    const fee = direction === "payout" ? formatToken(Number(r.feeAmount) / 1e6, "USDT") : formatToken(Number(r.feeAmount) / 1e18, token);
    return {
      ok: true,
      message: "Cotización indicativa de Textile (no reserva liquidez).",
      quote: {
        sell: direction === "payout" ? formatToken(usdt, "USDT") : formatToken(loc, token),
        buy: direction === "payout" ? formatToken(loc, token) : formatToken(usdt, "USDT"),
        fee,
        rate: `${formatNumber(loc / usdt, 2)} ${TOKENS[token].display} por USD₮`,
      },
    };
  }
  if (r.status === "no_quote") {
    const avail = direction === "payout" ? r.availableBuyAmount : r.availableSellAmount;
    return {
      ok: false,
      message: `no_quote: ${reasonEs(r.reason)}.${avail ? ` Textile publica hasta ${formatToken(Number(avail) / 1e18, token)} en una sola orden: el agente partiría el pago.` : ""}`,
    };
  }
  if (r.status === "unavailable") return { ok: false, message: `${reasonEs(r.reason)}.` };
  return { ok: false, message: r.message };
}
