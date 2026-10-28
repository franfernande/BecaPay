import { getPublicConfig } from "@/lib/config";
import { readDB } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const cfg = getPublicConfig();
  const db = readDB();
  return Response.json({
    ok: true,
    service: "becapay",
    chainId: 42220,
    mode: cfg.dryRun ? "dry_run" : "live",
    attributionTagConfigured: cfg.tagConfigured,
    programs: db.programs.length,
    schedulerLastTickAt: db.scheduler.lastTickAt ?? null,
  });
}
