import { parseEventLogs, type Hex } from "viem";
import { CELO_CHAIN_ID, ERC8004_IDENTITY_REGISTRY } from "./tokens";

/** Shared by the Next.js server and scripts/register-erc8004.ts (so no "server-only" here). */
export const identityRegistryAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Registered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentURI", type: "string", indexed: false },
      { name: "owner", type: "address", indexed: true },
    ],
  },
] as const;

export interface RegistrationInput {
  appUrl: string;
  agentWallet: string;
  agentId?: string;
}

export function buildRegistration({ appUrl, agentWallet, agentId }: RegistrationInput) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "BecaPay",
    description:
      "Autonomous scholarship-payout agent on Celo. Foundations fund in any currency; the agent can park idle cash in USD₮ via Textile FX and pays each student a fixed amount in their own Ripio wFIAT (wCOP, wBRL, wARS), with USD₮ fallback and a public, PII-free audit trail.",
    image: `${appUrl}/icon.svg`,
    services: [
      { name: "web", endpoint: appUrl },
      { name: "audit", endpoint: `${appUrl}/auditoria` },
      { name: "wallet", endpoint: `eip155:${CELO_CHAIN_ID}:${agentWallet}` },
    ],
    x402Support: false,
    active: true,
    supportedTrust: ["reputation"],
    registrations: agentId
      ? [{ agentId: Number(agentId), agentRegistry: `eip155:${CELO_CHAIN_ID}:${ERC8004_IDENTITY_REGISTRY}` }]
      : [],
  };
}

/** On-chain `data:` URI, so the identity works before the app has a public URL. */
export function registrationDataUri(input: RegistrationInput): string {
  const json = JSON.stringify(buildRegistration(input));
  return `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
}

interface ContractReader {
  readContract: (args: {
    address: `0x${string}`;
    abi: typeof identityRegistryAbi;
    functionName: "balanceOf";
    args: readonly [`0x${string}`];
  }) => Promise<unknown>;
}

export async function identityCount(client: ContractReader, wallet: `0x${string}`): Promise<bigint> {
  const result = await client.readContract({
    address: ERC8004_IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "balanceOf",
    args: [wallet],
  });
  return result as bigint;
}

export function agentIdFromReceipt(logs: Parameters<typeof parseEventLogs>[0]["logs"]): bigint | undefined {
  const [registered] = parseEventLogs({ abi: identityRegistryAbi, eventName: "Registered", logs });
  return registered?.args.agentId;
}

export type RegisterTxHash = Hex;
