import { TOKENS } from "./tokens";
import type { TokenSymbol } from "./types";

const TZ = "America/Argentina/Buenos_Aires";
const LOCALE = "es-AR";

export function formatNumber(value: number, maxDecimals = 2, minDecimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: Math.min(minDecimals, maxDecimals),
  }).format(value);
}

export function formatToken(value: number | string, token: TokenSymbol, opts?: { decimals?: number }): string {
  const n = typeof value === "string" ? Number(value) : value;
  const info = TOKENS[token];
  const decimals = opts?.decimals ?? info.displayDecimals;
  return `${formatNumber(n, decimals, token === "USDT" ? 2 : 0)} ${info.display}`;
}

export function formatUsd(value: number, decimals = 2): string {
  return `${formatNumber(value, decimals, decimals)} USD₮`;
}

export function formatDate(iso: string | undefined, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

export function formatDateTime(iso: string | undefined): string {
  return formatDate(iso, true);
}

export function formatRelativeDays(iso: string, now = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const days = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffMs) < 3_600_000) return diffMs >= 0 ? "en menos de una hora" : "hace instantes";
  if (days === 0) return diffMs > 0 ? "hoy" : "hoy (vencido)";
  if (days === 1) return "mañana";
  if (days === -1) return "ayer";
  if (days > 0) return `en ${days} días`;
  return `hace ${Math.abs(days)} días`;
}

export function shortAddress(address: string | undefined, chars = 4): string {
  if (!address) return "—";
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function formatPercent(value: number, decimals = 1): string {
  return `${formatNumber(value * 100, decimals, decimals)}%`;
}
