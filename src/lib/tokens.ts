import type { FiatSymbol, TokenSymbol } from "./types";

export const CELO_CHAIN_ID = 42220;
export const CELOSCAN = "https://celoscan.io";

/** Fee-currency adapter for USD₮ (6 decimals) on Celo mainnet. */
export const USDT_FEE_ADAPTER = "0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72" as const;

export const ERC8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
export const ERC8004_REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as const;

/**
 * MVP availability, from the Textile liquidity study (docs/textile-liquidity.md):
 * - recommended: healthy payout corridor
 * - careful: thin payout leg, needs per-student trades or splits
 * - fragile: no payout makers today; payments usually fall back to USD₮
 * - unavailable: no Textile corridor on Celo
 */
export type MvpStatus = "recommended" | "careful" | "fragile" | "unavailable";

export interface TokenInfo {
  symbol: TokenSymbol;
  display: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  fiat?: string;
  country?: string;
  countryName?: string;
  mvp?: MvpStatus;
  rampToken?: string;
  /** Formatting precision for display. */
  displayDecimals: number;
}

export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  USDT: {
    symbol: "USDT",
    display: "USD₮",
    name: "Dólar estable (Tether) en Celo",
    address: "0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e",
    decimals: 6,
    displayDecimals: 2,
  },
  wCOP: {
    symbol: "wCOP",
    display: "wCOP",
    name: "Peso colombiano on-chain (Ripio)",
    address: "0x8a1d45e102e886510e891d2ec656a708991e2d76",
    decimals: 18,
    fiat: "COP",
    country: "CO",
    countryName: "Colombia",
    mvp: "recommended",
    rampToken: "WCOP",
    displayDecimals: 0,
  },
  wBRL: {
    symbol: "wBRL",
    display: "wBRL",
    name: "Real brasileño on-chain (Ripio)",
    address: "0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0",
    decimals: 18,
    fiat: "BRL",
    country: "BR",
    countryName: "Brasil",
    mvp: "recommended",
    rampToken: "WBRL",
    displayDecimals: 2,
  },
  wARS: {
    symbol: "wARS",
    display: "wARS",
    name: "Peso argentino on-chain (Ripio)",
    address: "0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d",
    decimals: 18,
    fiat: "ARS",
    country: "AR",
    countryName: "Argentina",
    mvp: "careful",
    rampToken: "WARS",
    displayDecimals: 0,
  },
  wMXN: {
    symbol: "wMXN",
    display: "wMXN",
    name: "Peso mexicano on-chain (Ripio)",
    address: "0x337e7456b420bd3481e7fa61fa9850343d610d34",
    decimals: 18,
    fiat: "MXN",
    country: "MX",
    countryName: "México",
    mvp: "fragile",
    rampToken: "WMXN",
    displayDecimals: 2,
  },
  wPEN: {
    symbol: "wPEN",
    display: "wPEN",
    name: "Sol peruano on-chain (Ripio)",
    address: "0x4f34c8b3b5fb6d98da888f0fea543d4d9c9f2ebe",
    decimals: 18,
    fiat: "PEN",
    country: "PE",
    countryName: "Perú",
    mvp: "unavailable",
    rampToken: "WPEN",
    displayDecimals: 2,
  },
  wCLP: {
    symbol: "wCLP",
    display: "wCLP",
    name: "Peso chileno on-chain (Ripio)",
    address: "0x61d450a098b6a7f69fc4b98ce68198fe59768651",
    decimals: 18,
    fiat: "CLP",
    country: "CL",
    countryName: "Chile",
    mvp: "unavailable",
    rampToken: "WCLP",
    displayDecimals: 0,
  },
};

export const FIAT_SYMBOLS: FiatSymbol[] = ["wCOP", "wBRL", "wARS", "wMXN", "wPEN", "wCLP"];
export const ALL_TOKENS: TokenSymbol[] = ["USDT", ...FIAT_SYMBOLS];

/** Currencies a foundation may assign to a student in the MVP. */
export const SELECTABLE_FIAT: FiatSymbol[] = FIAT_SYMBOLS.filter(
  (s) => TOKENS[s].mvp !== "unavailable",
);

export const MVP_LABEL: Record<MvpStatus, string> = {
  recommended: "Recomendada",
  careful: "Con cuidado",
  fragile: "Frágil: suele pagarse en USD₮",
  unavailable: "Sin corredor en Celo",
};

export function tokenByAddress(address: string): TokenInfo | undefined {
  const a = address.toLowerCase();
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === a);
}

export function isFiat(symbol: TokenSymbol): symbol is FiatSymbol {
  return symbol !== "USDT";
}

export function rampUrl(token: TokenSymbol, wallet: string, amount?: number): string {
  const t = TOKENS[token];
  const params = new URLSearchParams({ chain: String(CELO_CHAIN_ID), address: wallet });
  if (t.country) params.set("country", t.country);
  if (t.rampToken) params.set("token", t.rampToken);
  if (amount && amount > 0) params.set("amount", String(Math.ceil(amount)));
  return `https://ramp.ripio.com/?${params.toString()}`;
}

export function offRampUrl(token: TokenSymbol): string {
  const t = TOKENS[token];
  const params = new URLSearchParams({ chain: String(CELO_CHAIN_ID) });
  if (t.country) params.set("country", t.country);
  if (t.rampToken) params.set("token", t.rampToken);
  return `https://ramp.ripio.com/offramp?${params.toString()}`;
}

export function txUrl(hash: string): string {
  return `${CELOSCAN}/tx/${hash}`;
}

export function addressUrl(address: string): string {
  return `${CELOSCAN}/address/${address}`;
}
