"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/actions";

/** Shows a toast every time a form action returns a new state. */
export function useActionToast(state: ActionState | null, onSuccess?: () => void) {
  const last = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) {
      toast.success(state.message);
      onSuccess?.();
    } else {
      toast.error(state.message);
    }
  }, [state, onSuccess]);
}

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] text-ink">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormError({ state }: { state: ActionState | null }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/20 bg-danger-soft px-3 py-2 text-[13px] text-destructive">
      {state.message}
    </p>
  );
}
