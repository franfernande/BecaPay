import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DB } from "./types";

const DATA_FILE = process.env.BECAPAY_DATA_FILE?.trim() || path.join(process.cwd(), "data", "becapay.json");

const MAX_LOG = 2000;

function emptyDB(): DB {
  return {
    version: 1,
    programs: [],
    students: [],
    deposits: [],
    cycles: [],
    payments: [],
    swaps: [],
    log: [],
    alerts: [],
    hedgeLots: [],
    ledger: {},
    textile: {
      previews: 0,
      firmQuotes: 0,
      noQuotes: 0,
      fills: 0,
      quotedNotionalUsdt: 0,
      filledNotionalUsdt: 0,
      feesUsdt: 0,
    },
    prechecks: {},
    identity: {},
    scheduler: {},
  };
}

export function readDB(): DB {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return { ...emptyDB(), ...(JSON.parse(raw) as Partial<DB>) } as DB;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyDB();
    throw new Error(`No pude leer el archivo de datos (${DATA_FILE}). ¿Está bien formado el JSON?`);
  }
}

export function writeDB(db: DB): void {
  if (db.log.length > MAX_LOG) db.log = db.log.slice(-MAX_LOG);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const json = JSON.stringify(db, null, 2);
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch {
    // Windows can refuse the rename while another process holds the file open.
    fs.writeFileSync(DATA_FILE, json, "utf8");
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
}

type Lock = { tail: Promise<unknown> };
const g = globalThis as unknown as { __becapayLock?: Lock };
const lock: Lock = (g.__becapayLock ??= { tail: Promise.resolve() });

/**
 * Serializes every mutation (UI actions, cycles, scheduler) so a cycle can never
 * interleave with another write and lose data.
 */
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.tail.then(fn, fn);
  lock.tail = run.catch(() => undefined);
  return run;
}

/** Read-modify-write under the lock. */
export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  return withLock(async () => {
    const db = readDB();
    const result = await fn(db);
    writeDB(db);
    return result;
  });
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

const OPAQUE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newPublicId(existing: Set<string>): string {
  for (;;) {
    const bytes = crypto.randomBytes(6);
    let id = "B-";
    for (const b of bytes) id += OPAQUE_ALPHABET[b % OPAQUE_ALPHABET.length];
    if (!existing.has(id)) return id;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
