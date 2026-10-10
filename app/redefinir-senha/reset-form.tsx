"use client";

import { useState } from "react";
import { resetPassword } from "../entrar/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

export default function ResetForm() {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <form className="auth-form" action={async form => {
    setBusy(true);
    try { const result = await resetPassword(form); setMessage(result.error ?? result.message ?? ""); }
    finally { setBusy(false); }
  }}>
    <label htmlFor="new-password">{t("Nova senha")}</label>
    <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
    <Button disabled={busy}>{t(busy ? "Salvando…" : "Salvar nova senha")}</Button>
    <p role="status">{t(message)}</p>
    <a href="/">{t("Abrir meu caderno")}</a>
  </form>;
}
