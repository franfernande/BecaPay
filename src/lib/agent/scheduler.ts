import "server-only";
import { getConfig } from "../config";
import { mutate, nowIso, readDB } from "../store";
import { prepareNextCycle, runCycle } from "./cycle";

const DAY_MS = 86_400_000;
const FAILED_RETRY_MS = 30 * 60_000;

const g = globalThis as unknown as { __becapayScheduler?: { timer: NodeJS.Timeout; running: boolean } };

export function startScheduler(): void {
  const cfg = getConfig();
  if (!cfg.schedulerEnabled || g.__becapayScheduler) return;
  const state = { timer: setInterval(() => void tick(), cfg.schedulerIntervalMs), running: false };
  state.timer.unref?.();
  g.__becapayScheduler = state;
  setTimeout(() => void tick(), 15_000).unref?.();
}

/**
 * One scheduler pass: runs cycles whose date arrived and, the day before payday,
 * runs the liquidity pre-check and pre-converts the local-currency buffer.
 */
export async function tick(): Promise<string[]> {
  const state = g.__becapayScheduler;
  if (state?.running) return ["ocupado"];
  if (state) state.running = true;
  const done: string[] = [];
  try {
    const db = readDB();
    const now = Date.now();
    for (const p of db.programs) {
      if (!p.autoRun || p.cyclesCompleted >= p.cyclesPlanned) continue;
      if (!db.students.some((s) => s.programId === p.id && s.active)) continue;
      const due = Date.parse(p.nextCycleAt);
      if (due <= now) {
        const recentFail = db.cycles.some(
          (c) => c.programId === p.id && c.period === p.nextCycleAt && c.status === "failed" && now - Date.parse(c.startedAt) < FAILED_RETRY_MS,
        );
        if (recentFail) continue;
        const r = await runCycle(p.id, "scheduled");
        done.push(`${p.name}: ${r.message}`);
      } else if (due - now <= DAY_MS && p.lastPrecheckFor !== p.nextCycleAt) {
        const r = await prepareNextCycle(p.id);
        done.push(`${p.name}: ${r.message}`);
      }
    }
    await mutate((d) => {
      d.scheduler.lastTickAt = nowIso();
    });
  } finally {
    if (state) state.running = false;
  }
  return done;
}
