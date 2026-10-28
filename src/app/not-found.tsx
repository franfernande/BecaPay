import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      icon={<SearchX />}
      title="No encontramos esa página"
      actions={
        <>
          <Button asChild>
            <Link href="/">Ir al panel</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/auditoria">Ver auditoría</Link>
          </Button>
        </>
      }
    >
      Si buscabas un becario, revisá que el id público esté bien escrito (por ejemplo B-7K2M9Q).
    </EmptyState>
  );
}
