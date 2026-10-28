import "server-only";
import { concat, type Hex } from "viem";
import { fromDataSuffix, toDataSuffix, verifyTx } from "@celo/attribution-tags";
import { getConfig } from "../config";
import { getPublicClient } from "./clients";

/** Local-development code suggested by celo-org/attribution-tags BUILDERS.md. */
export const PLACEHOLDER_TAG = "celo_test1234";

export function effectiveTag(): { code: string; placeholder: boolean } {
  const cfg = getConfig();
  if (cfg.attributionTagValid && cfg.attributionTag) return { code: cfg.attributionTag, placeholder: false };
  return { code: PLACEHOLDER_TAG, placeholder: true };
}

/** Appends the ERC-8021 suffix exactly as `withAttribution` does at send time. */
export function tagCalldata(data: Hex): { data: Hex; suffixBytes: number; verified: boolean; placeholder: boolean } {
  const { code, placeholder } = effectiveTag();
  const suffix = toDataSuffix(code) as Hex;
  const tagged = concat([data, suffix]);
  const decoded = fromDataSuffix(tagged);
  return {
    data: tagged,
    suffixBytes: (suffix.length - 2) / 2,
    verified: !!decoded?.codes.includes(code),
    placeholder,
  };
}

/** After a live send: confirm the on-chain input carries our code. */
export async function verifyOnchainTag(hash: Hex): Promise<boolean> {
  const { code } = effectiveTag();
  try {
    const result = await verifyTx({ client: getPublicClient(), hash });
    return !!result?.codes.includes(code);
  } catch {
    return false;
  }
}

export function maskTag(tag: string | undefined): string {
  if (!tag) return "no configurada";
  if (tag.length <= 8) return "configurada";
  return `${tag.slice(0, 5)}••••${tag.slice(-2)}`;
}
