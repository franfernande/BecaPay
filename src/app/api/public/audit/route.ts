import { loadAudit } from "@/lib/views";
import { txUrl } from "@/lib/tokens";

export const dynamic = "force-dynamic";

/** Public, PII-free audit export. */
export async function GET() {
  const d = await loadAudit();
  return Response.json({
    chainId: 42220,
    agentWallet: d.cfg.agentWallet ?? null,
    mode: d.cfg.dryRun ? "dry_run" : "live",
    identity: { agentId: d.identity.agentId ?? null, registrationTx: d.identity.txHash ?? null },
    totals: d.totals,
    totalsByToken: d.totalsByToken,
    programs: d.programs.map((p) => ({ id: p.id, name: p.name, organization: p.organization, cycles: p.cycles, demo: p.demo })),
    payments: d.payments.map((p) => ({
      at: p.at,
      program: p.programName,
      cycleId: p.cycleId,
      student: p.studentPublicId,
      wallet: p.wallet,
      requested: { token: p.requestedToken, amount: p.requestedAmount },
      paid: { token: p.paidToken, amount: p.paidAmount },
      status: p.status,
      reason: p.reason ?? null,
      simulated: p.simulated,
      txHash: p.txHash ?? null,
      celoscan: p.txHash ? txUrl(p.txHash) : null,
    })),
    swaps: d.swaps.map((s) => ({
      at: s.at,
      purpose: s.purpose,
      sell: { token: s.sellToken, amount: s.sellAmount },
      buy: { token: s.buyToken, amount: s.buyAmount },
      fee: s.feeAmount,
      rate: s.rate,
      chunks: s.chunks,
      quoteKind: s.quoteKind,
      simulated: s.simulated,
      rfqIds: s.rfqIds,
      txHashes: s.txHashes,
    })),
  });
}
