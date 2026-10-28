"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { previewQuoteAction, type QuoteState } from "@/app/actions";
import { FIAT_SYMBOLS, TOKENS } from "@/lib/tokens";
import { Field } from "./shared";

export function QuoteForm() {
  const [state, formAction, pending] = useActionState<QuoteState | null, FormData>(previewQuoteAction, null);

  return (
    <div className="grid gap-4">
      <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <Field label="Operación" htmlFor="q-dir">
          <NativeSelect id="q-dir" name="direction" defaultValue="payout">
            <option value="payout">Pagar: USD₮ → moneda local</option>
            <option value="hedge">Cubrir: moneda local → USD₮</option>
          </NativeSelect>
        </Field>
        <Field label="Moneda local" htmlFor="q-token">
          <NativeSelect id="q-token" name="token" defaultValue="wCOP">
            {FIAT_SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {TOKENS[s].display} · {TOKENS[s].countryName}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Monto en moneda local" htmlFor="q-amount">
          <Input id="q-amount" name="amount" required inputMode="decimal" defaultValue="350000" className="h-9 tabular" />
        </Field>
        <Button type="submit" disabled={pending} className="h-9">
          {pending && <Loader2 className="animate-spin" />}
          Cotizar
        </Button>
      </form>

      {state && state.ok && state.quote && (
        <div className="grid gap-3 rounded-lg border bg-success-soft/50 p-3 text-sm sm:grid-cols-[1fr_auto_1fr_1fr]">
          <div>
            <div className="text-xs text-muted-foreground">Entregás</div>
            <div className="font-medium tabular text-ink">{state.quote.sell}</div>
          </div>
          <ArrowRight className="hidden size-4 self-center text-muted-foreground sm:block" />
          <div>
            <div className="text-xs text-muted-foreground">Recibís</div>
            <div className="font-medium tabular text-ink">{state.quote.buy}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Tasa · comisión</div>
            <div className="tabular text-ink">
              {state.quote.rate} · {state.quote.fee}
            </div>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-4">{state.message}</p>
        </div>
      )}
      {state && !state.ok && (
        <p role="alert" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-[oklch(0.42_0.09_70)]">
          {state.message}
        </p>
      )}
    </div>
  );
}
