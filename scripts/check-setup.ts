/**
 * Read-only setup check. Never prints secrets: only whether they are present and valid.
 *   npm run check
 */
import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { celo } from "viem/chains";
import { identityCount } from "../src/lib/erc8004";
import { ALL_TOKENS, CELO_CHAIN_ID, TOKENS } from "../src/lib/tokens";
import { loadAccount, loadEnv, scriptConfig } from "./env";

const ok = (m: string) => console.log(`  ✓ ${m}`);
const warn = (m: string) => console.log(`  • ${m}`);
const bad = (m: string) => console.log(`  ✗ ${m}`);

async function main() {
  const env = loadEnv();
  const cfg = scriptConfig();
  console.log("BecaPay · chequeo de configuración\n");

  console.log("Archivo de configuración");
  if (env.file) ok(`${env.file} encontrado`);
  else warn("No hay .env.local: se usan valores por defecto (simulación). Copiá .env.example a .env.local.");

  console.log("\nModo");
  if (cfg.dryRun) ok("DRY_RUN=true · simulación (no firma ni envía transacciones)");
  else warn("DRY_RUN=false · MODO EN VIVO: el agente firma transacciones reales");

  console.log("\nCredenciales (no se muestran sus valores)");
  if (cfg.tagValid) ok("ATTRIBUTION_TAG configurada y con formato válido");
  else if (cfg.tag) bad("ATTRIBUTION_TAG con formato inválido (solo a-z, 0-9 y _, máx. 32)");
  else warn("ATTRIBUTION_TAG sin configurar (obligatoria para el modo en vivo)");
  if (!cfg.agentWallet) bad("AGENT_WALLET_ADDRESS inválida");
  else ok(`Wallet del agente: ${cfg.agentWallet}`);
  if (!cfg.keyConfigured) warn("AGENT_PRIVATE_KEY sin cargar (correcto para simulación)");
  else {
    try {
      const account = loadAccount();
      if (cfg.agentWallet && account.address.toLowerCase() === cfg.agentWallet.toLowerCase()) ok("AGENT_PRIVATE_KEY corresponde a la wallet del agente");
      else bad("AGENT_PRIVATE_KEY NO corresponde a AGENT_WALLET_ADDRESS");
    } catch (e) {
      bad((e as Error).message);
    }
  }

  console.log("\nCelo");
  const pub = createPublicClient({ chain: celo, transport: http(cfg.rpcUrl) });
  try {
    const id = await pub.getChainId();
    if (id === CELO_CHAIN_ID) ok(`RPC responde en Celo mainnet (${id})`);
    else bad(`RPC en chain id ${id}, se esperaba ${CELO_CHAIN_ID}`);
    if (cfg.agentWallet) {
      const celoBal = await pub.getBalance({ address: cfg.agentWallet });
      (celoBal > 0n ? ok : warn)(`CELO para gas: ${formatUnits(celoBal, 18)}`);
      const results = await pub.multicall({
        allowFailure: true,
        contracts: ALL_TOKENS.map((s) => ({ address: TOKENS[s].address, abi: erc20Abi, functionName: "balanceOf" as const, args: [cfg.agentWallet!] as const })),
      });
      const parts = ALL_TOKENS.map((s, i) => {
        const r = results[i];
        return r.status === "success" ? `${TOKENS[s].display} ${formatUnits(r.result as bigint, TOKENS[s].decimals)}` : `${TOKENS[s].display} ?`;
      });
      warn(`Saldos: ${parts.join(" · ")}`);
      const n = await identityCount(pub, cfg.agentWallet);
      (n > 0n ? ok : warn)(n > 0n ? `Identidad ERC-8004 registrada (${n})` : "Identidad ERC-8004 sin registrar (npm run register:8004)");
    }
  } catch (e) {
    bad(`No pude consultar Celo: ${(e as Error).message.split("\n")[0]}`);
  }

  console.log("\nTextile");
  try {
    const res = await fetch(`${cfg.textileApi}/rfq/levels?chainId=${CELO_CHAIN_ID}`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const json = (await res.json()) as { data?: { pairs?: unknown[] } };
      ok(`Niveles de liquidez disponibles (${json.data?.pairs?.length ?? 0} pares)`);
    } else bad(`Textile respondió HTTP ${res.status}`);
  } catch (e) {
    bad(`No pude consultar Textile: ${(e as Error).message}`);
  }
  console.log("");
}

main();
