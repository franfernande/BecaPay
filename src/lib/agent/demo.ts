import "server-only";
import { getAddress, keccak256, toHex } from "viem";
import { getConfig } from "../config";
import { mutate, newId, newPublicId, nowIso } from "../store";
import type { FiatSymbol, Program, Student } from "../types";
import { makeLogger } from "./common";

function demoWallet(seed: string): `0x${string}` {
  return getAddress(keccak256(toHex(`becapay-demo-${seed}`)).slice(0, 42));
}

function firstOfNextMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 15, 0, 0)).toISOString();
}

const DEMO_STUDENTS: { name: string; currency: FiatSymbol; amount: string; coverage: Student["coverage"] }[] = [
  { name: "Valentina R. (Bogotá)", currency: "wCOP", amount: "350000", coverage: "inherit" },
  { name: "João P. (São Paulo)", currency: "wBRL", amount: "600", coverage: "inherit" },
  { name: "Martina G. (Rosario)", currency: "wARS", amount: "150000", coverage: "off" },
  { name: "Diego H. (Guadalajara)", currency: "wMXN", amount: "2000", coverage: "inherit" },
];

export async function loadDemo(): Promise<{ ok: boolean; message: string }> {
  return mutate((db) => {
    const existing = db.programs.find((p) => p.demo);
    if (existing) {
      db.activeProgramId = existing.id;
      return { ok: true, message: "El programa de demostración ya existía; lo dejé activo." };
    }
    const mode = getConfig().dryRun ? "dry_run" : "live";
    const program: Program = {
      id: newId("prg"),
      name: "Becas Puentes 2026",
      organization: "Fundación Puentes (demo)",
      coverageEnabled: true,
      frequency: "monthly",
      nextCycleAt: firstOfNextMonth(),
      autoRun: true,
      cyclesPlanned: 12,
      cyclesCompleted: 0,
      lowCoverageCycles: 3,
      createdAt: nowIso(),
      demo: true,
    };
    db.programs.push(program);
    db.activeProgramId = program.id;
    const ids = new Set(db.students.map((s) => s.publicId));
    for (const s of DEMO_STUDENTS) {
      const publicId = newPublicId(ids);
      ids.add(publicId);
      db.students.push({
        id: newId("stu"),
        programId: program.id,
        publicId,
        displayName: s.name,
        wallet: demoWallet(s.name),
        currency: s.currency,
        amount: s.amount,
        coverage: s.coverage,
        active: true,
        demo: true,
        createdAt: nowIso(),
      });
    }
    const deposits = [
      { token: "USDT" as const, amount: "600" },
      { token: "wARS" as const, amount: "2000000" },
    ];
    db.ledger[program.id] = {};
    for (const d of deposits) {
      db.deposits.push({ id: newId("dep"), programId: program.id, token: d.token, amount: d.amount, at: nowIso(), simulated: true, note: "Fondeo de demostración" });
      db.ledger[program.id][d.token] = d.amount;
    }
    const log = makeLogger(db, program.id, undefined, mode);
    log.info(
      "config",
      "Programa de demostración creado",
      "4 becarios (wCOP, wBRL, wARS con cobertura apagada y wMXN para mostrar el respaldo en USD₮). Caja simulada: 600 USD₮ + 2.000.000 wARS. Las wallets de demo nunca reciben dinero real.",
    );
    return { ok: true, message: "Listo: cargué el programa de demostración." };
  });
}
