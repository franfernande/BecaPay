import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DB } from "./types";

function dataFile(): string {
  return process.env.BECAPAY_DATA_FILE?.trim() || path.join(process.cwd(), "data", "becapay.json");
}

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

type Memory = { __becapayMemory?: DB };
const memory = globalThis as typeof globalThis & Memory;

function cloneDB(db: DB): DB {
  return JSON.parse(JSON.stringify(db)) as DB;
}

export function readDB(): DB {
  // On Vercel the disk is read-only. A successful write stores the DB on this
  // server instance so "Cargar demo" and a cycle survive the next request.
  if (process.env.VERCEL && memory.__becapayMemory) return cloneDB(memory.__becapayMemory);
  const file = dataFile();
  try {
    const raw = fs.readFileSync(file, "utf8");
    return { ...emptyDB(), ...(JSON.parse(raw) as Partial<DB>) } as DB;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyDB();
    throw new Error(`No pude leer el archivo de datos (${file}). ¿Está bien formado el JSON?`);
  }
}

function writeToDisk(db: DB): void {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = JSON.stringify(db, null, 2);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, json, "utf8");
    fs.renameSync(tmp, file);
  } catch {
    // Windows can refuse the rename while another process holds the file open.
    fs.writeFileSync(file, json, "utf8");
    try {
      fs.rmSync(tmp, { force: true });
    } catch {}
  }
}

export function writeDB(db: DB): void {
  if (db.log.length > MAX_LOG) db.log = db.log.slice(-MAX_LOG);
  try {
    writeToDisk(db);
    memory.__becapayMemory = undefined;
  } catch (e) {
    if (!process.env.VERCEL) throw e;
    memory.__becapayMemory = cloneDB(db);
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
