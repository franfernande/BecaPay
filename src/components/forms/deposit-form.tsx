"use client";

import { useActionState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";
import { addDepositAction, type ActionState } from "@/app/actions";
import { ALL_TOKENS, TOKENS } from "@/lib/tokens";
import { Field, FormError, useActionToast } from "./shared";

export function DepositForm({ programId, dryRun }: { programId: string; dryRun: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(addDepositAction, null);
  useActionToast(state, () => ref.current?.reset());

  return (
    <form ref={ref} action={formAction} className="grid gap-4">
      <input type="hidden" name="programId" value={programId} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <Field label="Moneda" htmlFor="d-token">
          <NativeSelect id="d-token" name="token" defaultValue="USDT">
            {ALL_TOKENS.map((s) => (
              <option key={s} value={s}>
                {TOKENS[s].display}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Monto" htmlFor="d-amount">
          <Input id="d-amount" name="amount" required inputMode="decimal" placeholder="1000" className="h-9 tabular" />
        </Field>
      </div>
      <Field
        label="Hash de la transacción (opcional)"
        htmlFor="d-tx"
        hint={dryRun ? "En simulación podés dejarlo vacío." : "Si fondeaste on-chain, pegá el hash para que quede en la auditoría."}
      >
        <Input id="d-tx" name="txHash" placeholder="0x…" className="h-9 font-mono text-[13px]" spellCheck={false} autoComplete="off" />
      </Field>
      <Field label="Nota (opcional)" htmlFor="d-note">
        <Input id="d-note" name="note" maxLength={120} placeholder="Aporte donante marzo" className="h-9" />
      </Field>
      <FormError state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {dryRun ? "Sumar fondeo simulado" : "Registrar fondeo"}
        </Button>
      </div>
    </form>
  );
}
