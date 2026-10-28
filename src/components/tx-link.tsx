import { ArrowUpRight } from "lucide-react";
import { addressUrl, txUrl } from "@/lib/tokens";
import { shortAddress, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TxLink({ hash, className }: { hash?: string; className?: string }) {
  if (!hash) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-0.5 font-mono text-xs text-primary underline-offset-2 hover:underline", className)}
      title="Ver en Celoscan"
    >
      {shortHash(hash)}
      <ArrowUpRight className="size-3" />
    </a>
  );
}

export function AddressLink({ address, className, chars = 4 }: { address?: string; className?: string; chars?: number }) {
  if (!address) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={addressUrl(address)}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-0.5 font-mono text-xs text-primary underline-offset-2 hover:underline", className)}
      title={address}
    >
      {shortAddress(address, chars)}
      <ArrowUpRight className="size-3" />
    </a>
  );
}
