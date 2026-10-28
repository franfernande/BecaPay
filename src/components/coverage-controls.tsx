"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/native-select";
import type { ActionState } from "@/app/actions";
import type { CoverageOverride } from "@/lib/types";

export function CoverageSwitch({
  enabled,
  action,
  id = "coverage-switch",
}: {
  enabled: boolean;
  action: (enabled: boolean) => Promise<ActionState>;
  id?: string;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  return (
    <Switch
      id={id}
      checked={optimistic}
      disabled={pending}
      aria-label="Cobertura en USD₮ del programa"
      onCheckedChange={(v) =>
        start(async () => {
          setOptimistic(v);
          const r = await action(v);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        })
      }
    />
  );
}

const OPTIONS: { value: CoverageOverride; label: string }[] = [
  { value: "inherit", label: "Regla del programa" },
  { value: "on", label: "Proteger en USD₮" },
  { value: "off", label: "Mantener en moneda local" },
];

export function StudentCoverageSelect({
  value,
  action,
  label,
}: {
  value: CoverageOverride;
  action: (v: CoverageOverride) => Promise<ActionState>;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(value);
  return (
    <NativeSelect
      aria-label={label}
      value={optimistic}
      disabled={pending}
      className="min-w-44"
      onChange={(e) => {
        const v = e.target.value as CoverageOverride;
        start(async () => {
          setOptimistic(v);
          const r = await action(v);
          if (!r.ok) toast.error(r.message);
        });
      }}
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function ProgramSwitcher({
  programs,
  activeId,
  action,
}: {
  programs: { id: string; name: string }[];
  activeId?: string;
  action: (id: string) => Promise<ActionState>;
}) {
  const [pending, start] = useTransition();
  if (programs.length < 2) return null;
  return (
    <NativeSelect
      aria-label="Programa activo"
      value={activeId}
      disabled={pending}
      className="min-w-52"
      onChange={(e) => {
        const id = e.target.value;
        start(async () => {
          await action(id);
        });
      }}
    >
      {programs.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  );
}
