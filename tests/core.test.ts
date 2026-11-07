import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { planSwap, type ExecContext, type SwapSpec } from "../src/lib/agent/executor";
import { advanceDate, effectiveCoverage, makeLogger } from "../src/lib/agent/common";
import { tagCalldata } from "../src/lib/celo/attribution";
import { analyzeCurrency } from "../src/lib/textile/liquidity";
import type { TextileLevels } from "../src/lib/textile/client";
import type { DB, Program, Student } from "../src/lib/types";

const W = 10n ** 18n;
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function db(): DB {
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
    textile: { previews: 0, firmQuotes: 0, noQuotes: 0, fills: 0, quotedNotionalUsdt: 0, filledNotionalUsdt: 0, feesUsdt: 0 },
    prechecks: {},
    identity: {},
    scheduler: {},
  };
}

function ctx(maxSlippageBps = 150): ExecContext {
  const store = db();
  return { db: store, mode: "dry_run", programId: "p", log: makeLogger(store, "p", undefined, "dry_run"), maxSlippageBps };
}

/** Local units of wCOP per 1 USD₮, quoted as an exact-buy preview. */
function quote(buy: bigint, localPerUsdt: bigint) {
  const local = buy / W;
  const usdt = (local * 1_000_000n) / localPerUsdt;
  return {
    status: "preview",
    sellAmount: usdt.toString(),
    buyAmount: buy.toString(),
    feeAmount: "0",
    takerPays: usdt.toString(),
  };
}

function mockTextile(handler: (body: { buyAmount?: string }) => unknown) {
  const calls: bigint[] = [];
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { buyAmount?: string };
    if (body.buyAmount) calls.push(BigInt(body.buyAmount));
    return new Response(JSON.stringify({ data: handler(body) }), { status: 200 });
  }) as typeof fetch;
  return calls;
}

function buy(amount: bigint, refRate = 4000): SwapSpec {
  return { sell: "USDT", buy: "wCOP", exact: "buy", amount, purpose: "payout", refRate };
}

function program(coverageEnabled: boolean): Program {
  return {
    id: "p",
    name: "Programa",
    organization: "Fundación",
    coverageEnabled,
    frequency: "monthly",
    nextCycleAt: "2026-03-01T00:00:00.000Z",
    autoRun: false,
    cyclesPlanned: 6,
    cyclesCompleted: 0,
    lowCoverageCycles: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    demo: true,
  };
}

function student(coverage: Student["coverage"]): Student {
  return {
    id: "s",
    programId: "p",
    publicId: "B-TEST01",
    displayName: "Test",
    wallet: "0x0000000000000000000000000000000000000001",
    currency: "wARS",
    amount: "150000",
    coverage,
    active: true,
    demo: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function levels(localDepth: bigint): TextileLevels {
  return {
    asOf: "2026-01-01T00:00:00.000Z",
    pairs: [
      {
        sell: "USDT",
        buy: "wCOP",
        sellDecimals: 6,
        buyDecimals: 18,
        minSellAmount: 1n,
        maxSellAmount: 1_000_000_000n,
        levels: [{ sellAmount: 1_000_000_000n, buyAmount: localDepth }],
      },
    ],
  };
}

describe("order splitting", () => {
  test("splits an exact buy that is larger than published depth", async () => {
    const available = 400_000n * W;
    const calls = mockTextile((body) => {
      const buyAmount = BigInt(body.buyAmount ?? "0");
      if (buyAmount > available) {
        return { status: "no_quote", reason: "no_valid_quote", availableBuyAmount: available.toString() };
      }
      return quote(buyAmount, 4000n);
    });

    const plan = await planSwap(ctx(), buy(1_000_000n * W));

    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(plan.chunks.length, 3);
    assert.deepEqual(
      calls,
      [1_000_000n * W, 360_000n * W, 360_000n * W, 280_000n * W],
    );
    assert.equal(plan.chunks.reduce((sum, chunk) => sum + chunk.request, 0n), 1_000_000n * W);
  });

  test("does not split when Textile reports no usable depth", async () => {
    const calls = mockTextile(() => ({ status: "no_quote", reason: "no_makers_online" }));
    const plan = await planSwap(ctx(), buy(1_000n * W));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "no_quote");
    assert.equal(calls.length, 1);
  });

  test("stops when the shortfall would take more than six orders", async () => {
    const available = 100n * W;
    mockTextile(() => ({ status: "no_quote", reason: "no_valid_quote", availableBuyAmount: available.toString() }));
    const plan = await planSwap(ctx(), buy(1_000n * W));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "no_quote");
    assert.match(plan.reason, /6/);
  });
});

describe("slippage cap", () => {
  test("rejects a quote worse than MAX_SLIPPAGE_BPS", async () => {
    mockTextile((body) => quote(BigInt(body.buyAmount ?? "0"), 3000n));
    const plan = await planSwap(ctx(150), buy(400_000n * W, 4000));
    assert.equal(plan.ok, false);
    if (plan.ok) return;
    assert.equal(plan.code, "slippage");
  });

  test("accepts a quote inside the cap", async () => {
    mockTextile((body) => quote(BigInt(body.buyAmount ?? "0"), 4000n));
    const plan = await planSwap(ctx(150), buy(400_000n * W, 4000));
    assert.equal(plan.ok, true);
  });
});

describe("liquidity classification", () => {
  test("marks a cycle ok, fragile, or no_quote against published depth", () => {
    const book = levels(1_000_000n * W);
    assert.equal(analyzeCurrency(book, "wCOP", 500_000, 200_000, 2).status, "ok");
    assert.equal(analyzeCurrency(book, "wCOP", 800_000, 200_000, 4).status, "fragile");
    assert.equal(analyzeCurrency(book, "wCOP", 2_000_000, 1_500_000, 2).status, "no_quote");
  });

  test("marks a missing corridor", () => {
    const empty: TextileLevels = { asOf: "2026-01-01T00:00:00.000Z", pairs: [] };
    assert.equal(analyzeCurrency(empty, "wPEN", 100, 100, 1).status, "no_corridor");
  });
});

describe("coverage", () => {
  test("a student override wins over the program switch", () => {
    assert.equal(effectiveCoverage(program(false), student("on")), true);
    assert.equal(effectiveCoverage(program(true), student("off")), false);
    assert.equal(effectiveCoverage(program(true), student("inherit")), true);
    assert.equal(effectiveCoverage(program(false), student("inherit")), false);
  });
});

describe("schedule", () => {
  test("a monthly date on the 31st clamps to the end of February", () => {
    assert.equal(advanceDate("2026-01-31T00:00:00.000Z", "monthly"), "2026-02-28T00:00:00.000Z");
    assert.equal(advanceDate("2026-01-15T00:00:00.000Z", "weekly"), "2026-01-22T00:00:00.000Z");
  });
});

describe("attribution", () => {
  test("dry-run calldata keeps a suffix that decodes back to the tag", () => {
    const tagged = tagCalldata("0xabcdef");
    assert.equal(tagged.verified, true);
    assert.equal(tagged.suffixBytes, 31);
    assert.ok(tagged.data.startsWith("0xabcdef"));
  });
});
