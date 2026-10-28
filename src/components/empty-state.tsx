import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center", className)}>
      {icon && <div className="grid size-10 place-items-center rounded-full bg-secondary text-primary [&_svg]:size-5">{icon}</div>}
      <div className="space-y-1">
        <div className="font-medium text-ink">{title}</div>
        {children && <div className="mx-auto max-w-md text-sm text-muted-foreground">{children}</div>}
      </div>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}
