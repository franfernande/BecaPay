/**
 * Runs the real agent engine in simulation from the terminal:
 * loads the demo program if there is none, runs the Textile liquidity pre-check
 * and one payment cycle with real Textile preview quotes. Never signs anything.
 *
 *   npm run simulate
 */
import { loadEnv } from "./env";

async function main() {
  loadEnv();
  if (process.env.DRY_RUN?.trim().toLowerCase() === "false") {
    console.error("✗ Este script solo corre en simulación. Poné DRY_RUN=true (o quitá la variable) y volvé a intentar.");
    process.exit(1);
  }
  process.env.DRY_RUN = "true";
  process.env.SCHEDULER_ENABLED = "false";

  const { readDB } = await import("../src/lib/store");
  const { loadDemo } = await import("../src/lib/agent/demo");
  const { runPrecheck, runCycle } = await import("../src/lib/agent/cycle");
  const { activeProgram } = await import("../src/lib/views");

  let db = readDB();
  if (!activeProgram(db)) {
    const r = await loadDemo();
    console.log(`Demo: ${r.message}`);
    db = readDB();
  }
  const program = activeProgram(db)!;
  console.log(`Programa: ${program.name} (${program.organization})\n`);

  const since = db.log.length ? db.log[db.log.length - 1].id : undefined;
  const pre = await runPrecheck(program.id);
  console.log(`Pre-chequeo: ${pre.message}`);
  const cycle = await runCycle(program.id, "manual");
  console.log(`Ciclo: ${cycle.message}\n`);

  const log = readDB().log;
  const start = since ? log.findIndex((l) => l.id === since) + 1 : 0;
  console.log("Bitácora del agente:");
  for (const l of log.slice(start)) {
    const mark = { info: "·", ok: "✓", warn: "!", error: "✗" }[l.level];
    console.log(`  ${mark} [${l.step}] ${l.title}`);
    if (l.detail) console.log(`      ${l.detail}`);
  }
}

main().catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
