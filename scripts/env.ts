import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getAddress, isAddress } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/** Script-side env loader. Mirrors src/lib/config.ts without the Next.js "server-only" guard. */
export const DEFAULT_AGENT_WALLET = "0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c";

export function loadEnv(): { file?: string } {
  for (const name of [".env.local", ".env"]) {
    const file = resolve(process.cwd(), name);
    if (existsSync(file)) {
      process.loadEnvFile(file);
      return { file: name };
    }
  }
  return {};
}

export function scriptConfig() {
  const env = process.env;
  const wallet = env.AGENT_WALLET_ADDRESS?.trim() || DEFAULT_AGENT_WALLET;
  const tag = env.ATTRIBUTION_TAG?.trim() || undefined;
  return {
    dryRun: env.DRY_RUN?.trim().toLowerCase() !== "false",
    rpcUrl: env.CELO_RPC_URL?.trim() || "https://forno.celo.org",
    agentWallet: isAddress(wallet) ? getAddress(wallet) : undefined,
    tag,
    tagValid: !!tag && /^[a-z0-9_]{1,32}$/.test(tag),
    keyConfigured: !!env.AGENT_PRIVATE_KEY?.trim(),
    gasCurrency: env.GAS_CURRENCY?.trim().toUpperCase() === "USDT" ? ("USDT" as const) : ("CELO" as const),
    publicAppUrl: (env.PUBLIC_APP_URL?.trim() || "http://localhost:4317").replace(/\/$/, ""),
    textileApi: (env.TEXTILE_API_URL?.trim() || "https://api.textilecredit.com/v2").replace(/\/$/, ""),
    dataFile: env.BECAPAY_DATA_FILE?.trim() || resolve(process.cwd(), "data", "becapay.json"),
  };
}

/** Never prints or returns key material in errors. */
export function loadAccount(): PrivateKeyAccount {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("Falta AGENT_PRIVATE_KEY en .env.local.");
  const hex = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) throw new Error("AGENT_PRIVATE_KEY no tiene el formato esperado (64 caracteres hexadecimales).");
  return privateKeyToAccount(hex);
}
