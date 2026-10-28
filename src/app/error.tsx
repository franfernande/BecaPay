"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<TriangleAlert />}
      title="No pude cargar esta página"
      actions={
        <Button onClick={reset}>
          <RotateCcw /> Reintentar
        </Button>
      }
    >
      Puede ser un problema momentáneo de conexión con Celo o con Textile. Ningún pago se ejecuta desde esta pantalla, así que es seguro reintentar.
      {error.digest && <span className="mt-2 block font-mono text-[11px]">Código: {error.digest}</span>}
    </EmptyState>
  );
}
