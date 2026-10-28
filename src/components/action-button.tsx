"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionState } from "@/app/actions";

type ButtonProps = React.ComponentProps<typeof Button>;

export function ActionButton({
  action,
  children,
  pendingLabel,
  confirm,
  variant,
  size,
  className,
  disabled,
  icon,
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  pendingLabel?: string;
  confirm?: { title: string; description: React.ReactNode; confirmLabel?: string; destructive?: boolean };
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () => {
    setOpen(false);
    start(async () => {
      try {
        const r = await action();
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      } catch {
        toast.error("No se pudo completar la acción. Revisá la bitácora y volvé a intentar.");
      }
    });
  };

  const button = (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || pending}
      onClick={confirm ? () => setOpen(true) : run}
      aria-busy={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );

  if (!confirm) return button;

  return (
    <>
      {button}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">{confirm.description}</div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant={confirm.destructive ? "destructive" : "default"} onClick={run}>
              {confirm.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
