import { getConfig } from "@/lib/config";
import { buildRegistration } from "@/lib/erc8004";
import { readDB } from "@/lib/store";

export const dynamic = "force-dynamic";

/** ERC-8004 registration file (same JSON that goes on-chain as a data: URI). */
export function GET() {
  const cfg = getConfig();
  const agentId = cfg.erc8004AgentId ?? readDB().identity.agentId;
  return Response.json(buildRegistration({ appUrl: cfg.publicAppUrl, agentWallet: cfg.agentWallet ?? "", agentId }), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
