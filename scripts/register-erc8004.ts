/**
 * Registers the BecaPay agent in the ERC-8004 Identity Registry on Celo mainnet.
 *
 *   npm run register:8004            → dry run: prints the registration file and simulates the call
 *   npm run register:8004 -- --send  → sends the real transaction (needs DRY_RUN=false, key and tag)
 *
 * The transaction is sent from the agent wallet and carries the ERC-8021 attribution tag.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { celo } from "viem/chains";
import { verifyTx, withAttribution } from "@celo/attribution-tags";
import { agentIdFromReceipt, buildRegistration, identityCount, identityRegistryAbi, registrationDataUri } from "../src/lib/erc8004";
import { CELO_CHAIN_ID, ERC8004_IDENTITY_REGISTRY, USDT_FEE_ADAPTER } from "../src/lib/tokens";
import { loadAccount, loadEnv, scriptConfig } from "./env";

const send = process.argv.includes("--send");

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function main() {
  const env = loadEnv();
  const cfg = scriptConfig();
  console.log(`BecaPay · registro ERC-8004 ${send ? "(ENVÍO REAL)" : "(simulación)"}`);
  console.log(`Config: ${env.file ?? "sin .env.local (valores por defecto)"}`);

  const pub = createPublicClient({ chain: celo, transport: http(cfg.rpcUrl) });
  const chainId = await pub.getChainId();
  if (chainId !== CELO_CHAIN_ID) fail(`El RPC responde chain id ${chainId}; se esperaba ${CELO_CHAIN_ID} (Celo mainnet).`);
  console.log(`Red: Celo mainnet (${chainId})`);

  if (!cfg.agentWallet) fail("AGENT_WALLET_ADDRESS no es una dirección válida.");
  console.log(`Wallet del agente: ${cfg.agentWallet}`);

  const count = await identityCount(pub, cfg.agentWallet);
  if (count > 0n) {
    console.log(`\n✓ Esta wallet ya tiene ${count} identidad(es) ERC-8004 en ${ERC8004_IDENTITY_REGISTRY}. No hace falta registrar.`);
    return;
  }

  const registration = buildRegistration({ appUrl: cfg.publicAppUrl, agentWallet: cfg.agentWallet });
  const agentURI = registrationDataUri({ appUrl: cfg.publicAppUrl, agentWallet: cfg.agentWallet });
  console.log("\nArchivo de registro (se publica on-chain como data: URI):");
  console.log(JSON.stringify(registration, null, 2));

  const balance = await pub.getBalance({ address: cfg.agentWallet });
  console.log(`\nSaldo CELO para gas: ${formatEther(balance)}`);
  console.log(`Etiqueta ERC-8021: ${cfg.tagValid ? "configurada" : cfg.tag ? "formato inválido" : "FALTA"}`);

  try {
    const gas = await pub.estimateContractGas({
      account: cfg.agentWallet,
      address: ERC8004_IDENTITY_REGISTRY,
      abi: identityRegistryAbi,
      functionName: "register",
      args: [agentURI],
    });
    console.log(`Simulación (eth_estimateGas): OK, ~${gas} de gas.`);
  } catch (e) {
    console.log(`Simulación: no se pudo estimar (${(e as Error).message.split("\n")[0]}). Suele pasar si la wallet no tiene saldo.`);
  }

  if (!send) {
    console.log("\nNo se envió nada. Para registrar de verdad: poné DRY_RUN=false en .env.local y corré `npm run register:8004 -- --send`.");
    return;
  }

  if (cfg.dryRun) fail("DRY_RUN sigue en true. Cambialo a false en .env.local solo cuando quieras enviar la transacción.");
  if (!cfg.tagValid) fail("Falta ATTRIBUTION_TAG válida: ninguna transacción sale sin etiqueta ERC-8021.");
  const account = loadAccount();
  if (account.address.toLowerCase() !== cfg.agentWallet.toLowerCase()) fail("AGENT_PRIVATE_KEY no corresponde a AGENT_WALLET_ADDRESS.");
  if (balance === 0n && cfg.gasCurrency === "CELO") fail("La wallet del agente no tiene CELO para pagar el gas.");

  const wallet = createWalletClient({ account, chain: celo, transport: http(cfg.rpcUrl) }).extend(withAttribution(cfg.tag!));
  const { request } = await pub.simulateContract({
    account,
    address: ERC8004_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [agentURI],
  });
  const hash = await wallet.writeContract({
    ...request,
    ...(cfg.gasCurrency === "USDT" ? { feeCurrency: USDT_FEE_ADAPTER } : {}),
  });
  console.log(`\nTransacción enviada: https://celoscan.io/tx/${hash}`);
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") fail("La transacción revirtió.");
  const agentId = agentIdFromReceipt(receipt.logs);
  const tagged = await verifyTx({ client: pub, hash }).catch(() => null);
  console.log(`✓ Identidad registrada${agentId !== undefined ? ` · agentId ${agentId}` : ""}`);
  console.log(`Etiqueta ERC-8021 en la transacción: ${tagged?.codes.includes(cfg.tag!) ? "verificada" : "no verificada"}`);

  if (existsSync(cfg.dataFile)) {
    const db = JSON.parse(readFileSync(cfg.dataFile, "utf8"));
    db.identity = { agentId: agentId?.toString(), txHash: hash, agentURI, registeredAt: new Date().toISOString() };
    const tmp = `${cfg.dataFile}.tmp`;
    writeFileSync(tmp, JSON.stringify(db, null, 2));
    renameSync(tmp, cfg.dataFile);
    console.log("Guardado en data/becapay.json.");
  }
  if (agentId !== undefined) console.log(`Sugerencia: agregá ERC8004_AGENT_ID=${agentId} a .env.local.`);
}

main().catch((e) => fail((e as Error).message.split("\n")[0]));
