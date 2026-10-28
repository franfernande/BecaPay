import "server-only";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getAddress, isAddress } from "viem";

export type GasCurrency = "CELO" | "USDT";

export interface AppConfig {
  dryRun: boolean;
  rpcUrl: string;
  agentWallet: `0x${string}` | undefined;
  attributionTag: string | undefined;
  attributionTagValid: boolean;
  keyConfigured: boolean;
  gasCurrency: GasCurrency;
  textileApi: string;
  textileApiKeyConfigured: boolean;
  maxUsdtPerCycle: number;
  maxSlippageBps: number;
  schedulerEnabled: boolean;
  schedulerIntervalMs: number;
  publicAppUrl: string;
  erc8004AgentId: string | undefined;
}

/** Safe subset that can be sent to the browser. Contains no secrets. */
export interface PublicConfig {
  dryRun: boolean;
  agentWallet: string | undefined;
  tagConfigured: boolean;
  keyConfigured: boolean;
  gasCurrency: GasCurrency;
  maxUsdtPerCycle: number;
  maxSlippageBps: number;
  schedulerEnabled: boolean;
  tagSetButInvalid: boolean;
  textileKeyConfigured: boolean;
  adminProtected: boolean;
  publicAppUrl: string;
}

const TAG_RE = /^[a-z0-9_]{1,32}$/;

/** Public address of the BecaPay agent wallet (not a secret). Overridable via AGENT_WALLET_ADDRESS. */
export const DEFAULT_AGENT_WALLET = "0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c";

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getConfig(): AppConfig {
  const env = process.env;
  const wallet = env.AGENT_WALLET_ADDRESS?.trim() || DEFAULT_AGENT_WALLET;
  const tag = env.ATTRIBUTION_TAG?.trim() || undefined;
  return {
    // Anything other than an explicit "false" keeps the agent in simulation.
    dryRun: env.DRY_RUN?.trim().toLowerCase() !== "false",
    rpcUrl: env.CELO_RPC_URL?.trim() || "https://forno.celo.org",
    agentWallet: wallet && isAddress(wallet) ? getAddress(wallet) : undefined,
    attributionTag: tag,
    attributionTagValid: !!tag && TAG_RE.test(tag),
    keyConfigured: !!env.AGENT_PRIVATE_KEY?.trim(),
    gasCurrency: env.GAS_CURRENCY?.trim().toUpperCase() === "USDT" ? "USDT" : "CELO",
    textileApi: (env.TEXTILE_API_URL?.trim() || "https://api.textilecredit.com/v2").replace(/\/$/, ""),
    textileApiKeyConfigured: !!env.TEXTILE_API_KEY?.trim(),
    maxUsdtPerCycle: num(env.MAX_USDT_PER_CYCLE, 500),
    maxSlippageBps: num(env.MAX_SLIPPAGE_BPS, 150),
    schedulerEnabled: env.SCHEDULER_ENABLED?.trim().toLowerCase() !== "false",
    schedulerIntervalMs: num(env.SCHEDULER_INTERVAL_SECONDS, 60) * 1000,
    publicAppUrl: (env.PUBLIC_APP_URL?.trim() || "http://localhost:4317").replace(/\/$/, ""),
    erc8004AgentId: env.ERC8004_AGENT_ID?.trim() || undefined,
  };
}

export function getPublicConfig(): PublicConfig {
  const c = getConfig();
  return {
    dryRun: c.dryRun,
    agentWallet: c.agentWallet,
    tagConfigured: c.attributionTagValid,
    keyConfigured: c.keyConfigured,
    gasCurrency: c.gasCurrency,
    maxUsdtPerCycle: c.maxUsdtPerCycle,
    maxSlippageBps: c.maxSlippageBps,
    schedulerEnabled: c.schedulerEnabled,
    tagSetButInvalid: !!c.attributionTag && !c.attributionTagValid,
    textileKeyConfigured: c.textileApiKeyConfigured,
    adminProtected: !!process.env.ADMIN_PASSWORD?.trim(),
    publicAppUrl: c.publicAppUrl,
  };
}

/** Textile partner key, if any. Only used in request headers. */
export function getTextileApiKey(): string | undefined {
  return process.env.TEXTILE_API_KEY?.trim() || undefined;
}

/**
 * Loads the agent signer. Error messages never include the key material.
 */
export function getAgentAccount(): PrivateKeyAccount {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("Falta AGENT_PRIVATE_KEY en .env.local.");
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("AGENT_PRIVATE_KEY no tiene el formato esperado (64 caracteres hexadecimales).");
  }
  return privateKeyToAccount(hex);
}

export interface LiveReadiness {
  ready: boolean;
  problems: string[];
}

/** Every condition that must hold before the agent may sign anything on mainnet. */
export function checkLiveReadiness(): LiveReadiness {
  const c = getConfig();
  const problems: string[] = [];
  if (c.dryRun) problems.push("DRY_RUN está activo (modo simulación).");
  if (!c.attributionTag) problems.push("Falta ATTRIBUTION_TAG: ninguna transacción puede salir sin la etiqueta ERC-8021.");
  else if (!c.attributionTagValid) problems.push("ATTRIBUTION_TAG tiene un formato inválido (solo a-z, 0-9 y _).");
  if (!c.agentWallet) problems.push("Falta AGENT_WALLET_ADDRESS o no es una dirección válida.");
  if (!c.keyConfigured) {
    problems.push("Falta AGENT_PRIVATE_KEY.");
  } else {
    try {
      const account = getAgentAccount();
      if (c.agentWallet && account.address.toLowerCase() !== c.agentWallet.toLowerCase()) {
        problems.push("La clave privada no corresponde a AGENT_WALLET_ADDRESS.");
      }
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return { ready: problems.length === 0, problems };
}
