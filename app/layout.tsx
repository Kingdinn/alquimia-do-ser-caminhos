import type { Metadata } from "next";
import AmbientMusic from "@/components/ambient-music";
import "./globals.css";
import {I18nProvider} from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Alquimia do Ser · Caminhos",
  description: "Seu caderno de sonhos, escolhas e pequenos passos.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body><I18nProvider>{children}<AmbientMusic /></I18nProvider></body></html>;
}
