import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { readDB, writeDB } from "../src/lib/store";
import type { DB, Program } from "../src/lib/types";

const mem = globalThis as typeof globalThis & { __becapayMemory?: DB };

afterEach(() => {
  delete process.env.VERCEL;
  delete process.env.BECAPAY_DATA_FILE;
  delete mem.__becapayMemory;
});

function program(): Program {
  return {
    id: "prg_test",
    name: "Becas Puentes 2026",
    organization: "Fundación Puentes (demo)",
    coverageEnabled: true,
    frequency: "monthly",
    nextCycleAt: "2026-12-01T15:00:00.000Z",
    autoRun: true,
    cyclesPlanned: 12,
    cyclesCompleted: 0,
    lowCoverageCycles: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    demo: true,
  };
}

test("a read-only disk keeps the demo database in memory", () => {
  const blocker = path.join(os.tmpdir(), `becapay-notdir-${process.pid}`);
  fs.writeFileSync(blocker, "not a directory");
  process.env.BECAPAY_DATA_FILE = path.join(blocker, "becapay.json");
  process.env.VERCEL = "1";
  try {
    const db = readDB();
    db.programs.push(program());
    writeDB(db);
    const again = readDB();
    assert.equal(again.programs.length, 1);
    assert.equal(again.programs[0]?.name, "Becas Puentes 2026");
    assert.equal(fs.statSync(blocker).isFile(), true);
  } finally {
    fs.rmSync(blocker, { force: true });
  }
});
