import "server-only";
import { erc20Abi, formatUnits } from "viem";
import { ALL_TOKENS, TOKENS } from "../tokens";
import type { TokenSymbol } from "../types";
import { getPublicClient } from "./clients";

export interface OnchainBalances {
  ok: boolean;
  error?: string;
  celo: number;
  tokens: Partial<Record<TokenSymbol, bigint>>;
  readAt: string;
}

const g = globalThis as unknown as { __becapayBalances?: { key: string; at: number; value: OnchainBalances } };

export async function readOnchainBalances(wallet: `0x${string}` | undefined, maxAgeMs = 15_000): Promise<OnchainBalances> {
  const empty: OnchainBalances = { ok: false, celo: 0, tokens: {}, readAt: new Date().toISOString() };
  if (!wallet) return { ...empty, error: "No hay wallet del agente configurada." };
  const cached = g.__becapayBalances;
  if (cached && cached.key === wallet && Date.now() - cached.at < maxAgeMs) return cached.value;
  try {
    const client = getPublicClient();
    const [native, results] = await Promise.all([
      client.getBalance({ address: wallet }),
      client.multicall({
        allowFailure: true,
        contracts: ALL_TOKENS.map((s) => ({
          address: TOKENS[s].address,
          abi: erc20Abi,
          functionName: "balanceOf" as const,
          args: [wallet] as const,
        })),
      }),
    ]);
    const tokens: Partial<Record<TokenSymbol, bigint>> = {};
    ALL_TOKENS.forEach((s, i) => {
      const r = results[i];
      if (r.status === "success") tokens[s] = r.result as bigint;
    });
    const value: OnchainBalances = {
      ok: true,
      celo: Number(formatUnits(native, 18)),
      tokens,
      readAt: new Date().toISOString(),
    };
    g.__becapayBalances = { key: wallet, at: Date.now(), value };
    return value;
  } catch (e) {
    return { ...empty, error: `No pude leer la red Celo: ${(e as Error).message.split("\n")[0]}` };
  }
}

export function invalidateBalanceCache(): void {
  g.__becapayBalances = undefined;
}
