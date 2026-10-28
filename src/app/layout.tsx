import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BecaPay · Becas programables en Celo",
  description:
    "Agente que paga becas en la moneda local de cada estudiante (wFIAT de Ripio) sobre Celo, con cobertura opcional en USD₮ vía Textile y trazabilidad pública.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={200}>
          <AppHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <footer className="border-t bg-card/60">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span>BecaPay · agente de becas en Celo mainnet (42220) · wFIAT de Ripio · FX vía Textile</span>
              <span>Cada transacción del agente lleva etiqueta de atribución ERC-8021.</span>
            </div>
          </footer>
        </TooltipProvider>
        <Toaster theme="light" position="bottom-right" richColors={false} />
      </body>
    </html>
  );
}
