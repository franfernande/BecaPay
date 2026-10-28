import "server-only";
import { getAgentAccount, getConfig } from "../config";
import { agentIdFromReceipt, identityCount, identityRegistryAbi, registrationDataUri } from "../erc8004";
import { ERC8004_IDENTITY_REGISTRY } from "../tokens";
import { mutate, nowIso, readDB } from "../store";
import { getLiveWalletClient, getPublicClient, gasOptions } from "./clients";
import { verifyOnchainTag } from "./attribution";
import { makeLogger } from "../agent/common";
import { cleanError } from "../agent/executor";

export interface IdentityStatus {
  registered: boolean;
  count?: number;
  agentId?: string;
  txHash?: string;
  error?: string;
}

export async function readIdentityStatus(): Promise<IdentityStatus> {
  const cfg = getConfig();
  const stored = readDB().identity;
  const agentId = cfg.erc8004AgentId ?? stored.agentId;
  if (!cfg.agentWallet) return { registered: !!agentId, agentId, error: "Falta AGENT_WALLET_ADDRESS." };
  try {
    const count = await identityCount(getPublicClient(), cfg.agentWallet);
    return { registered: count > 0n || !!agentId, count: Number(count), agentId, txHash: stored.txHash };
  } catch (e) {
    return { registered: !!agentId, agentId, txHash: stored.txHash, error: cleanError(e) };
  }
}

/** Live mode only: mints the agent's ERC-8004 identity from the agent wallet (tagged tx). */
export async function registerIdentity(): Promise<{ ok: boolean; message: string }> {
  const cfg = getConfig();
  if (cfg.dryRun) return { ok: false, message: "DRY_RUN está activo: no registro nada en mainnet." };
  const status = await readIdentityStatus();
  if (status.registered) return { ok: false, message: "La wallet del agente ya tiene una identidad ERC-8004." };
  try {
    const wallet = getLiveWalletClient();
    const account = getAgentAccount();
    const agentURI = registrationDataUri({ appUrl: cfg.publicAppUrl, agentWallet: account.address });
    const pub = getPublicClient();
    const { request } = await pub.simulateContract({
      account,
      address: ERC8004_IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [agentURI],
    });
    const hash = await wallet.writeContract({ ...request, ...gasOptions() });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") return { ok: false, message: `La transacción ${hash} revirtió.` };
    const agentId = agentIdFromReceipt(receipt.logs);
    const tagged = await verifyOnchainTag(hash);
    await mutate((db) => {
      db.identity = { agentId: agentId?.toString(), txHash: hash, agentURI, registeredAt: nowIso() };
      makeLogger(db, undefined, undefined, "live").ok(
        "identidad",
        `Identidad ERC-8004 registrada${agentId !== undefined ? ` (agentId ${agentId})` : ""}`,
        tagged ? "Etiqueta ERC-8021 verificada en la transacción." : "Atención: no pude verificar la etiqueta ERC-8021.",
        hash,
      );
    });
    return { ok: true, message: `Identidad registrada${agentId !== undefined ? ` con agentId ${agentId}` : ""}.` };
  } catch (e) {
    return { ok: false, message: cleanError(e) };
  }
}
