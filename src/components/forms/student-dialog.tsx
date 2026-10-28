"use client";

import { useActionState, useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/native-select";
import { addStudentAction, updateStudentAction, type ActionState } from "@/app/actions";
import { FIAT_SYMBOLS, MVP_LABEL, TOKENS } from "@/lib/tokens";
import type { CoverageOverride, FiatSymbol } from "@/lib/types";
import { Field, FormError, useActionToast } from "./shared";

export interface StudentFormValues {
  id?: string;
  displayName: string;
  wallet: string;
  currency: FiatSymbol;
  amount: string;
  coverage: CoverageOverride;
}

const HINT: Record<string, string> = {
  recommended: "Textile tiene liquidez para pagar en esta moneda.",
  careful: "Liquidez ajustada: el agente puede partir el pago en varias órdenes.",
  fragile: "Hoy casi no hay liquidez para comprar esta moneda: el pago probablemente salga en USD₮ con aviso.",
};

export function StudentDialog({
  programId,
  values,
  trigger,
}: {
  programId: string;
  values?: StudentFormValues;
  trigger: React.ReactNode;
}) {
  const editing = !!values?.id;
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<FiatSymbol>(values?.currency ?? "wCOP");
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    editing ? updateStudentAction : addStudentAction,
    null,
  );
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, close);
  const mvp = TOKENS[currency].mvp;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar becario" : "Agregar becario"}</DialogTitle>
          <DialogDescription>
            La organización decide quién cobra y cuánto. El agente solo ejecuta el pago en la moneda elegida.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="programId" value={programId} />
          {values?.id && <input type="hidden" name="id" value={values.id} />}
          <Field label="Nombre (privado)" htmlFor="s-name" hint="Solo lo ve la organización. En la vista pública aparece un id opaco.">
            <Input id="s-name" name="displayName" required minLength={2} maxLength={80} defaultValue={values?.displayName} placeholder="Valentina R." className="h-9" />
          </Field>
          <Field label="Wallet en Celo" htmlFor="s-wallet" hint="Dirección 0x… del becario (por ejemplo, su cuenta en Ripio o una wallet propia).">
            <Input id="s-wallet" name="wallet" required defaultValue={values?.wallet} placeholder="0x…" className="h-9 font-mono text-[13px]" spellCheck={false} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Moneda de pago" htmlFor="s-currency">
              <NativeSelect id="s-currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as FiatSymbol)}>
                {FIAT_SYMBOLS.map((s) => {
                  const t = TOKENS[s];
                  const unavailable = t.mvp === "unavailable";
                  return (
                    <option key={s} value={s} disabled={unavailable}>
                      {t.display} · {t.countryName}
                      {t.mvp ? ` — ${MVP_LABEL[t.mvp]}` : ""}
                    </option>
                  );
                })}
              </NativeSelect>
            </Field>
            <Field label={`Monto fijo por pago (${TOKENS[currency].fiat})`} htmlFor="s-amount">
              <Input id="s-amount" name="amount" required inputMode="decimal" defaultValue={values?.amount} placeholder="350000" className="h-9 tabular" />
            </Field>
          </div>
          {mvp && HINT[mvp] && (
            <p className={mvp === "recommended" ? "text-xs text-muted-foreground" : "rounded-lg bg-warning-soft px-3 py-2 text-xs text-[oklch(0.42_0.09_70)]"}>
              {HINT[mvp]}
            </p>
          )}
          <Field label="Cobertura del saldo de este becario" htmlFor="s-coverage">
            <NativeSelect id="s-coverage" name="coverage" defaultValue={values?.coverage ?? "inherit"}>
              <option value="inherit">Usar la regla del programa</option>
              <option value="on">Proteger en USD₮</option>
              <option value="off">Mantener en moneda local</option>
            </NativeSelect>
          </Field>
          <FormError state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Guardar" : "Agregar becario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
