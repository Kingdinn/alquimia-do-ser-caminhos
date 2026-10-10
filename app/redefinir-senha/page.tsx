import { currentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LanguageSwitcher from "@/components/language-switcher";
import { Trans } from "@/lib/i18n";
import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.EMAIL_AUTH_READY !== "true" || !await currentUser()) redirect("/entrar");
  return <main className="login-page"><section className="login-card">
    <LanguageSwitcher />
    <h1><Trans text="Uma nova senha" /></h1>
    <ResetForm />
  </section></main>;
}
