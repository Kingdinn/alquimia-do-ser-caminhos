import type { Metadata } from "next";
import JournalApp from "@/app/journal";

export const metadata: Metadata = {
  title: "Explore seu caminho · Alquimia do Ser",
  robots: { index: false, follow: false },
};

export default function DemonstracaoPage() {
  return <JournalApp demo />;
}
