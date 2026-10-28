import "server-only";
import { createPublicClient, createWalletClient, http } from "viem";
import { celo } from "viem/chains";
import { withAttribution } from "@celo/attribution-tags";
import { checkLiveReadiness, getAgentAccount, getConfig } from "../config";
import { USDT_FEE_ADAPTER } from "../tokens";

const g = globalThis as unknown as { __becapayPublicClient?: ReturnType<typeof makePublicClient> };

function makePublicClient() {
  return createPublicClient({
    chain: celo,
    transport: http(getConfig().rpcUrl, { timeout: 20_000, retryCount: 2 }),
  });
}

export function getPublicClient() {
  return (g.__becapayPublicClient ??= makePublicClient());
}

/**
 * The only way this app builds a signing client. It refuses to exist unless every
 * live-mode guard passes, and it always carries the ERC-8021 attribution tag, so
 * no code path can send an untagged mainnet transaction.
 */
export function getLiveWalletClient() {
  const readiness = checkLiveReadiness();
  if (!readiness.ready) {
    throw new Error(`Modo en vivo bloqueado: ${readiness.problems.join(" ")}`);
  }
  const cfg = getConfig();
  const account = getAgentAccount();
  return createWalletClient({
    account,
    chain: celo,
    transport: http(cfg.rpcUrl, { timeout: 30_000 }),
  }).extend(withAttribution(cfg.attributionTag!));
}

/** Extra tx fields for paying gas in USD₮ (Celo fee abstraction, CIP-64). */
export function gasOptions(): { feeCurrency?: `0x${string}` } {
  return getConfig().gasCurrency === "USDT" ? { feeCurrency: USDT_FEE_ADAPTER } : {};
}
