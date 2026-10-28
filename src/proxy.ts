import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP Basic Auth for the foundation's admin area, enabled when ADMIN_PASSWORD is set.
 * Public routes (auditor view, student view, public JSON) stay open, but server actions are
 * always protected because they can be POSTed to any path with a `next-action` header.
 */
const PUBLIC = [/^\/auditoria(\/|$)/, /^\/becario\//, /^\/api\/public\//, /^\/api\/health$/, /^\/api\/agent\/registration$/];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function hasValidBasicAuth(req: NextRequest, password: string): boolean {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    return safeEqual(user, process.env.ADMIN_USER?.trim() || "fundacion") && safeEqual(pass, password);
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const path = req.nextUrl.pathname;
  const isAction = req.headers.has("next-action");
  if (!isAction && PUBLIC.some((r) => r.test(path))) return NextResponse.next();
  if (!isAction && path === "/api/agent/tick" && process.env.CRON_SECRET?.trim()) return NextResponse.next();
  if (hasValidBasicAuth(req, password)) return NextResponse.next();

  return new NextResponse("Se requiere usuario y contraseña de la fundación.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="BecaPay", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
