import { timingSafeEqual } from "node:crypto";
import { tick } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs one scheduler pass (due cycles + day-before liquidity prep). For external cron. */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const results = await tick();
  return Response.json({ ok: true, results });
}
