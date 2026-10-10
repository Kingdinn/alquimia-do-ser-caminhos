import type { Metadata } from "next";
import PrivacyContent from "./privacy-content";

export const metadata: Metadata = {
  title: "Privacidade · Alquimia do Ser",
  description: "Como funcionam a conta, o caderno privado e os pedidos de exclusão no Alquimia do Ser.",
};


export default function PrivacyPage() {
  return <PrivacyContent />;
}
