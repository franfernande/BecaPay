# BecaPay

**Programmable scholarships on Celo.** BecaPay is an autonomous agent that pays each student a fixed amount in their own local currency (Ripio wFIAT: wCOP, wBRL, wARS, wMXN), protects the foundation's idle cash in USD₮, and leaves every payment publicly auditable on Celoscan without exposing personal data.

Built for the **Agents on Open Rails** hackathon. Track 1 (Stable Agents, Ripio × Celo) and Track 2A (Textile).

> **Resumen en español.** BecaPay es un agente que paga becas en la moneda local de cada estudiante (wFIAT de Ripio) sobre Celo mainnet. La fundación fondea en cualquier moneda; el agente revisa la liquidez en Textile el día antes, cambia lo justo para cada becario, paga en la fecha y, si no hay liquidez, paga en USD₮ y avisa. Opcionalmente guarda el excedente en USD₮ para protegerlo de la devaluación. Cada transacción lleva la etiqueta de atribución ERC-8021 y el agente tiene identidad ERC-8004. Por defecto corre en **simulación** (`DRY_RUN=true`): usa cotizaciones reales de Textile pero no firma nada. Para correrlo: `npm install`, `npm run dev` y abrir http://localhost:4317.

---

## The problem

Latin American foundations fund scholarships in dollars or pesos, but students live in pesos, reais, or soles. Every month someone converts money by hand, pays bank fees, and argues with donors about where the money went. Meanwhile, idle peso balances lose value to inflation (wARS especially).

## What the agent does

Every cycle (monthly, biweekly, or weekly), on its own schedule:

1. **The day before payday:** reads Textile's published liquidity (`GET /v2/rfq/levels`) for each currency the program pays in and classifies it as *ok / fragile / no_quote / no_corridor*. Optionally pre-converts the local-currency buffer.
2. **On payday:**
   - pays from the local-currency balance when there is enough;
   - otherwise asks Textile for a quote per student for exactly the shortfall (USD₮ → wFIAT, `exact buy`), splitting into smaller orders when one order is too big for the published depth, and rejecting quotes worse than `MAX_SLIPPAGE_BPS` vs. the reference rate;
   - if Textile returns `no_quote` (or the corridor does not exist), pays the **same value in USD₮** at the market rate, marks the payment as `fallback` (never as "paid in local currency"), and raises an alert to the foundation.
3. **After paying:** if USD₮ coverage is ON, keeps only one cycle of local-currency buffer for covered students and converts the rest to USD₮ (with a hedge lot for P&L tracking). Coverage can be overridden per student.
4. **Treasury health:** computes runway in cycles. Below the program's threshold it raises a *low coverage* alert with a pre-filled **Ripio Ramp** link to top up.
5. **Explains everything:** every decision goes into a plain-Spanish decision log ("Bitácora"), with transaction links.

The foundation decides who gets paid and how much; the agent only executes.

## Screens

| Route | Who | What |
|---|---|---|
| `/` | Foundation | Dashboard: treasury (composition by currency), next payment, paid to date, treasury health (runway), alerts with Ripio Ramp, students with liquidity status, last cycle, USD₮ coverage toggle with P&L, Textile volume, recent decisions, real on-chain balance of the agent wallet. "Run cycle" button. |
| `/programa` | Foundation | Students (add/edit/pause, per-student coverage), funding (simulated deposits or on-chain funding + Ripio Ramp links), program rules. |
| `/liquidez` | Foundation | Textile corridors wFIAT ↔ USD₮ with depth and rates, per-currency needs for the next cycle, live quote tester (`POST /v2/rfq/preview`), Textile activity stats. |
| `/bitacora` | Foundation | Full decision log, filterable by cycle. |
| `/auditoria` | **Public** | Every payment and swap with Celoscan links, totals by currency, agent identity. Students appear only as opaque ids (`B-XXXXXX`). JSON export at `/api/public/audit`. |
| `/becario/[id]` | **Public** (student) | Student's own view: next payment, history with tx links, explanation when paid in USD₮, Ripio off-ramp link. No name shown. |
| `/identidad` | Foundation | Compliance checklist (chain 42220, ERC-8021 tag, key ↔ wallet match, gas, ERC-8004, DRY_RUN), registration JSON, register button. |

## Hackathon rules: how each one is met

| Rule | How BecaPay meets it |
|---|---|
| **Celo mainnet (chain id 42220)** | Uses viem's `celo` chain and `https://forno.celo.org`. Before any live cycle the agent checks `eth_chainId === 42220` and refuses otherwise. The `/identidad` page shows the live check. |
| **Real wFIAT** | Ripio's mainnet wCOP, wBRL, wARS, wMXN, wPEN, wCLP addresses (`src/lib/tokens.ts`). Payments are ERC-20 `transfer`s of those tokens. wPEN/wCLP have no Textile corridor today, so the UI does not allow them as payout currencies. |
| **ERC-8021 attribution on every transaction** | The **only** signing client in the app is created in `src/lib/celo/clients.ts` as `createWalletClient(...).extend(withAttribution(tag))` from [`@celo/attribution-tags`](https://github.com/celo-org/attribution-tags). It refuses to exist without a valid `ATTRIBUTION_TAG`. Payments, approvals, Textile swaps and the ERC-8004 registration all go through it. After each live send the agent re-reads the tx and verifies the tag with `verifyTx`. In dry run, the agent builds the exact calldata and appends/verifies the suffix with `toDataSuffix`/`fromDataSuffix` (logged as "+31 bytes, verified"). |
| **ERC-8004 agent identity** | `npm run register:8004` (or the button on `/identidad`) calls `register(agentURI)` on the Celo Identity Registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` from the agent wallet, with the attribution tag. The registration file follows `registration-v1` and is served at `/api/agent/registration`. |
| **Textile (Track 2A)** | Levels for pre-checks, `preview` for simulation, firm RFQ (`/v2/rfq/request`) with EIP-712 *Textile Taker Control* proof, exact approval to the reactor (reset to 0 first if needed), `expiresAt` check, swap tx, and `POST /v2/rfq/{id}/submit`. Handles all-or-nothing quotes by splitting orders, and `no_quote` by USD₮ fallback. Tracks quoted vs. executed volume, fees, `no_quote` count, and mark-to-market P&L of the coverage. |
| **Ripio Ramp** | Low-coverage alerts and the funding tab link to `ramp.ripio.com` pre-filled with country, chain 42220, token and the agent wallet. Students get an off-ramp link. |

## Safety design

- **`DRY_RUN=true` by default.** Anything other than the literal `false` keeps the agent in simulation. In simulation it uses **real Textile preview quotes** and a simulated treasury, builds the tagged calldata, and signs nothing.
- **Live mode requires all of:** `DRY_RUN=false`, a valid `ATTRIBUTION_TAG`, `AGENT_PRIVATE_KEY` that matches `AGENT_WALLET_ADDRESS`, and the RPC reporting chain 42220. The checklist on `/identidad` shows what is missing.
- **Limits:** `MAX_USDT_PER_CYCLE` caps USD₮ spent per cycle; `MAX_SLIPPAGE_BPS` rejects bad quotes; approvals are exact (never unlimited); demo students are never paid in live mode.
- **Secrets** live only in `.env.local` (gitignored). The app never prints the private key or the attribution tag; the UI only says "configured / missing".
- **Concurrency:** every write (UI actions, cycles, scheduler) goes through a single lock, so two cycles can never interleave.
- **Optional admin password:** set `ADMIN_PASSWORD` before exposing the app publicly. Admin pages and **all server actions** then require HTTP Basic Auth; `/auditoria`, `/becario/*` and public JSON stay open.

## Architecture

```
Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui)
│
├─ src/app/                 pages (Spanish UI) + server actions + API routes
│   ├─ actions.ts           create program, students, deposits, coverage, run cycle…
│   └─ api/                 /health, /public/audit, /agent/registration, /agent/tick
├─ src/lib/agent/
│   ├─ cycle.ts             pre-check, payment cycle, USD₮ fallback, coverage, alerts
│   ├─ executor.ts          transfers and Textile swaps (dry run vs. live)
│   └─ scheduler.ts         in-process scheduler (due cycles + day-before prep)
├─ src/lib/textile/         Textile RFQ client and liquidity analysis
├─ src/lib/celo/            viem clients (attribution-tagged signer), balances, ERC-8004
├─ src/lib/store.ts         JSON persistence in data/becapay.json (atomic writes)
└─ scripts/                 check-setup, register-erc8004, simulate-cycle
```

- **On-chain is the source of truth** for live payments: the live treasury is the agent wallet's balance read from Celo. The JSON file stores programs, students (names stay private), the decision log, and references to transactions.
- The scheduler starts with the server (`src/instrumentation.ts`) and checks every `SCHEDULER_INTERVAL_SECONDS`. For serverless hosting, call `POST /api/agent/tick` from a cron (protect it with `CRON_SECRET`).

## Run it

Requirements: Node.js 20+ (tested with Node 24) and npm.

```bash
npm install
npm run dev            # http://localhost:4317
```

Then open the dashboard and click **"Cargar demo"**, then **"Correr ciclo"**. Or, from the terminal:

```bash
npm run simulate       # loads the demo and runs one dry-run cycle with real Textile quotes
npm run check          # read-only setup check (never prints secrets)
npm run register:8004  # prints the ERC-8004 registration and simulates it (no tx)
```

### Going live (only after reviewing a dry run)

1. `cp .env.example .env.local` and fill in `AGENT_PRIVATE_KEY` and `ATTRIBUTION_TAG` yourself.
2. Fund the agent wallet `0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c` with a little CELO for gas (or USD₮ and set `GAS_CURRENCY=USDT`), plus USD₮ / wFIAT for payments.
3. Set `PUBLIC_APP_URL` to the public URL of the app, then `npm run register:8004 -- --send` (with `DRY_RUN=false`).
4. Set `DRY_RUN=false`, restart, check `/identidad` is all green, and run the first cycle with the button (it asks for confirmation).

### Environment variables

See [`.env.example`](.env.example) (commented in Spanish). The main ones are `DRY_RUN`, `AGENT_WALLET_ADDRESS`, `AGENT_PRIVATE_KEY`, `ATTRIBUTION_TAG`, `GAS_CURRENCY`, `MAX_USDT_PER_CYCLE`, `MAX_SLIPPAGE_BPS`, `PUBLIC_APP_URL`, `ADMIN_PASSWORD`, and `CRON_SECRET`.

## Current limitations

- wMXN has no payout makers on Textile today, so wMXN students are paid in USD₮ with an alert. wPEN and wCLP have no corridor at all and cannot be selected.
- Persistence is a single JSON file: ideal for one foundation running the agent on its own machine or a small VM; not meant for multi-tenant hosting.
- The public audit view shows student wallets (they are public on-chain anyway) but never names.
