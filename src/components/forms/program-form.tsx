"use client";

import { useActionState, useId } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/native-select";
import { createProgramAction, updateProgramAction, type ActionState } from "@/app/actions";
import type { Frequency } from "@/lib/types";
import { Field, FormError, useActionToast } from "./shared";

export interface ProgramFormValues {
  id?: string;
  name: string;
  organization: string;
  frequency: Frequency;
  nextCycleLocal: string;
  cyclesPlanned: number;
  lowCoverageCycles: number;
  coverageEnabled: boolean;
  autoRun: boolean;
}

export function ProgramForm({ values, mode }: { values: ProgramFormValues; mode: "create" | "edit" }) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    mode === "create" ? createProgramAction : updateProgramAction,
    null,
  );
  useActionToast(state);
  const uid = useId();

  return (
    <form action={formAction} className="grid gap-4">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del programa" htmlFor={`${uid}-name`}>
          <Input id={`${uid}-name`} name="name" required minLength={3} maxLength={80} defaultValue={values.name} placeholder="Becas Puentes 2026" className="h-9" />
        </Field>
        <Field label="Organización" htmlFor={`${uid}-org`}>
          <Input id={`${uid}-org`} name="organization" required maxLength={80} defaultValue={values.organization} placeholder="Fundación Puentes" className="h-9" />
        </Field>
        <Field label="Frecuencia de pago" htmlFor={`${uid}-freq`}>
          <NativeSelect id={`${uid}-freq`} name="frequency" defaultValue={values.frequency}>
            <option value="monthly">Mensual</option>
            <option value="biweekly">Quincenal</option>
            <option value="weekly">Semanal</option>
          </NativeSelect>
        </Field>
        <Field label="Próximo pago" htmlFor={`${uid}-next`} hint="Fecha y hora en que el agente ejecuta el ciclo.">
          <Input id={`${uid}-next`} name="nextCycleAt" type="datetime-local" required defaultValue={values.nextCycleLocal} className="h-9" />
        </Field>
        <Field label="Cantidad de pagos del programa" htmlFor={`${uid}-cycles`} hint="Se usa para el presupuesto total.">
          <Input id={`${uid}-cycles`} name="cyclesPlanned" type="number" min={1} max={120} defaultValue={values.cyclesPlanned} className="h-9" />
        </Field>
        <Field label="Alertar si la caja cubre menos de" htmlFor={`${uid}-low`} hint="Ciclos de pago. Al bajar de este umbral, el agente sugiere recargar vía Ripio.">
          <Input id={`${uid}-low`} name="lowCoverageCycles" type="number" min={1} max={24} defaultValue={values.lowCoverageCycles} className="h-9" />
        </Field>
      </div>

      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-2">
        <label className="flex items-start gap-3">
          <Switch name="coverageEnabled" defaultChecked={values.coverageEnabled} className="mt-0.5" />
          <span className="text-[13px]">
            <span className="block font-medium text-ink">Cobertura en USD₮</span>
            <span className="text-muted-foreground">Guarda el excedente en dólares y convierte a moneda local solo al pagar.</span>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <Switch name="autoRun" defaultChecked={values.autoRun} className="mt-0.5" />
          <span className="text-[13px]">
            <span className="block font-medium text-ink">Ciclos programados</span>
            <span className="text-muted-foreground">El agente paga solo en la fecha y revisa la liquidez el día anterior.</span>
          </span>
        </label>
      </div>

      <FormError state={state} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} size="lg">
          {pending && <Loader2 className="animate-spin" />}
          {mode === "create" ? "Crear programa" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
