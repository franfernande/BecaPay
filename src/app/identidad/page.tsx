import { CircleCheck, CircleDashed, CircleX, Fingerprint, Terminal } from "lucide-react";
import { encodeFunctionData, erc20Abi } from "viem";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status";
import { AddressLink, TxLink } from "@/components/tx-link";
import { registerIdentityAction } from "@/app/actions";
import { tagCalldata } from "@/lib/celo/attribution";
import { readOnchainBalances } from "@/lib/celo/balances";
import { getPublicClient } from "@/lib/celo/clients";
import { readIdentityStatus } from "@/lib/celo/identity";
import { checkLiveReadiness, getConfig, getPublicConfig } from "@/lib/config";
import { buildRegistration } from "@/lib/erc8004";
import { formatNumber, formatUsd } from "@/lib/format";
import { CELO_CHAIN_ID, ERC8004_IDENTITY_REGISTRY, TOKENS } from "@/lib/tokens";
import { readDB } from "@/lib/store";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type State = "ok" | "pending" | "bad";

async function rpcChainId(): Promise<{ id?: number; error?: string }> {
  try {
    return { id: await getPublicClient().getChainId() };
  } catch (e) {
    return { error: (e as Error).message.split("\n")[0] };
  }
}

export default async function IdentityPage() {
  const cfg = getPublicConfig();
  const full = getConfig();
  const [chain, identity, balances] = await Promise.all([rpcChainId(), readIdentityStatus(), readOnchainBalances(full.agentWallet)]);
  const readiness = checkLiveReadiness();
  const stored = readDB().identity;
  const sample = tagCalldata(
    encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", 1n] }),
  );
  const registration = buildRegistration({
    appUrl: full.publicAppUrl,
    agentWallet: full.agentWallet ?? "0x…",
    agentId: identity.agentId,
  });
  const usdt = balances.tokens.USDT ? Number(balances.tokens.USDT) / 10 ** TOKENS.USDT.decimals : 0;
  const hasGas = balances.celo > 0 || (cfg.gasCurrency === "USDT" && usdt > 0);
  const keyProblem = readiness.problems.find((p) => p.includes("AGENT_PRIVATE_KEY") || p.includes("clave privada"));

  const checks: { label: string; state: State; detail: React.ReactNode }[] = [
    {
      label: "Red Celo mainnet (chain id 42220)",
      state: chain.id === CELO_CHAIN_ID ? "ok" : "bad",
      detail: chain.id ? `El RPC responde con chain id ${chain.id}.` : `No pude consultar el RPC: ${chain.error}`,
    },
    {
      label: "Etiqueta de atribución ERC-8021",
      state: cfg.tagConfigured ? "ok" : cfg.tagSetButInvalid ? "bad" : "pending",
      detail: cfg.tagConfigured
        ? `Configurada. Se agrega al calldata de cada transacción (${sample.suffixBytes} bytes, verificada con el SDK de Celo).`
        : cfg.tagSetButInvalid
          ? "ATTRIBUTION_TAG tiene un formato inválido: usá solo minúsculas, números y _ (máx. 32)."
          : "Falta ATTRIBUTION_TAG en .env.local. Sin etiqueta el agente se niega a firmar en vivo.",
    },
    {
      label: "Wallet del agente",
      state: full.agentWallet ? "ok" : "bad",
      detail: full.agentWallet ? <AddressLink address={full.agentWallet} chars={6} /> : "Falta AGENT_WALLET_ADDRESS.",
    },
    {
      label: "Clave privada del agente",
      state: !cfg.keyConfigured ? "pending" : keyProblem ? "bad" : "ok",
      detail: !cfg.keyConfigured
        ? "Sin cargar (correcto para simulación). Se carga solo en .env.local; la app nunca la muestra."
        : keyProblem ?? "Cargada y corresponde a la wallet del agente.",
    },
    {
      label: "Gas para transacciones",
      state: hasGas ? "ok" : "pending",
      detail: balances.error
        ? balances.error
        : `${formatNumber(balances.celo, 4)} CELO · ${formatUsd(usdt)} · gas en ${cfg.gasCurrency === "USDT" ? "USD₮ (fee currency)" : "CELO"}.`,
    },
    {
      label: "Identidad ERC-8004",
      state: identity.registered ? "ok" : "pending",
      detail: identity.registered
        ? `Registrada${identity.agentId ? ` · agentId ${identity.agentId}` : ""}.`
        : identity.error
          ? `No registrada (${identity.error}).`
          : "Todavía no registrada en el Identity Registry de Celo.",
    },
    {
      label: "Modo de ejecución",
      state: cfg.dryRun ? "pending" : "ok",
      detail: cfg.dryRun ? "DRY_RUN=true: simula con cotizaciones reales, sin firmar." : "DRY_RUN=false: firma y envía transacciones reales.",
    },
    {
      label: "Protección del panel de administración",
      state: cfg.adminProtected ? "ok" : "pending",
      detail: cfg.adminProtected
        ? "ADMIN_PASSWORD configurada: las acciones del panel piden usuario y contraseña."
        : "Sin ADMIN_PASSWORD. Está bien en tu computadora; configurala antes de publicar la app.",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cumplimiento · Celo"
        title="Identidad y reglas del agente"
        description="Lo que tiene que estar en orden antes de que el agente mueva dinero real en Celo mainnet."
      />

      <Card>
        <CardHeader>
          <CardTitle>Lista de verificación</CardTitle>
          <CardDescription>{readiness.ready ? "Todo listo para operar en vivo." : "El agente solo firma en vivo cuando todo lo obligatorio está en verde."}</CardDescription>
          <CardAction>{readiness.ready ? <Pill tone="ok">Listo para mainnet</Pill> : <Pill tone="warn">Solo simulación</Pill>}</CardAction>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <StateIcon state={c.state} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{c.label}</div>
                  <div className="text-[13px] text-muted-foreground">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {!readiness.ready && (
            <div className="mt-4 rounded-lg bg-muted/60 p-3 text-[12px] text-muted-foreground">
              <div className="mb-1 font-medium text-ink">Por qué no firma en vivo todavía</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {readiness.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="size-4 text-primary" /> Registro ERC-8004
            </CardTitle>
            <CardDescription>
              La identidad on-chain del agente en el Identity Registry de Celo (<AddressLink address={ERC8004_IDENTITY_REGISTRY} />). Se registra desde la
              wallet del agente con la etiqueta ERC-8021.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stored.txHash && (
              <p className="text-[13px]">
                Transacción de registro: <TxLink hash={stored.txHash} />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={registerIdentityAction}
                disabled={cfg.dryRun || identity.registered || !readiness.ready}
                pendingLabel="Registrando…"
                confirm={{
                  title: "¿Registrar la identidad en mainnet?",
                  description: "Se envía una transacción real desde la wallet del agente al Identity Registry (paga gas).",
                  confirmLabel: "Registrar",
                }}
              >
                Registrar identidad
              </ActionButton>
              {cfg.dryRun && <span className="text-xs text-muted-foreground">Deshabilitado en simulación (DRY_RUN=true).</span>}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-ink">
                <Terminal className="size-3.5" /> O desde la terminal
              </div>
              <Cmd value="npm run register:8004" note="Muestra el JSON y simula el registro, sin enviar nada." />
              <Cmd value="npm run register:8004 -- --send" note="Envía la transacción real. Requiere DRY_RUN=false, clave y etiqueta." />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Archivo de registro (agentURI)</CardTitle>
            <CardDescription>
              Se publica on-chain como <span className="font-mono">data:</span> URI y también en{" "}
              <a href="/api/agent/registration" className="text-primary hover:underline" target="_blank" rel="noreferrer">
                /api/agent/registration
              </a>
              .
            </CardDescription>
            <CardAction>
              <CopyButton value={JSON.stringify(registration, null, 2)} label="Copiar JSON" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-lg bg-ink p-3 font-mono text-[11px] leading-relaxed text-[oklch(0.93_0.02_160)]">
              {JSON.stringify(registration, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Límites de seguridad</CardTitle>
          <CardDescription>Topes que el agente respeta en cada ciclo, aunque la caja tenga más fondos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-[13px] sm:grid-cols-3">
          <Limit label="Máximo de USD₮ por ciclo" value={formatUsd(cfg.maxUsdtPerCycle, 0)} />
          <Limit label="Desvío máximo de precio" value={`${formatNumber(cfg.maxSlippageBps / 100, 2)}%`} />
          <Limit label="Aprobaciones de tokens" value="Exactas por orden" />
        </CardContent>
      </Card>
    </div>
  );
}

function StateIcon({ state }: { state: State }) {
  const cls = "mt-0.5 size-4.5 shrink-0";
  if (state === "ok") return <CircleCheck className={cn(cls, "text-success")} />;
  if (state === "bad") return <CircleX className={cn(cls, "text-destructive")} />;
  return <CircleDashed className={cn(cls, "text-warning")} />;
}

function Cmd({ value, note }: { value: string; note: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <div className="min-w-0">
        <code className="font-mono text-[12px] text-ink">{value}</code>
        <div className="text-[11px] text-muted-foreground">{note}</div>
      </div>
      <CopyButton value={value} label="Copiar comando" />
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}
