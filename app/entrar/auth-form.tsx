"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { ChevronDown } from "lucide-react";
import { authenticate, signInWithGoogle } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./login.module.css";

type Props = { configured: boolean; googleEnabled: boolean; emailAuthReady: boolean; emailDisclosure?: boolean };

function GoogleIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" className={styles.googleIcon}>
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.34Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.13H3.07v2.58A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.41 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96l3.34-2.58Z" />
    <path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.59 9.59 0 0 0 12 2a10 10 0 0 0-8.93 5.52l3.34 2.58C7.2 7.73 9.4 5.97 12 5.97Z" />
  </svg>;
}

export default function AuthForm({ configured, googleEnabled, emailAuthReady, emailDisclosure = false }: Props) {
  const { t } = useI18n();
  const [selectedMode, setMode] = useState("login");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mode = emailAuthReady ? selectedMode : "login";
  const emailForm = <form className={styles.emailForm} action={async form => {
    setBusy(true); setMessage("");
    try { const result = await authenticate(form); setMessage(result.error ?? result.message ?? ""); } finally { setBusy(false); }
  }}>
    {emailAuthReady && <Tabs value={mode} onValueChange={value => { setMode(value); setMessage(""); }}><TabsList aria-label={t("Entrar ou criar conta")}><TabsTrigger value="login" disabled={busy}>{t("Entrar")}</TabsTrigger><TabsTrigger value="signup" disabled={busy}>{t("Criar conta")}</TabsTrigger></TabsList></Tabs>}
    {mode === "reset" && <h3>{t("Recuperar minha senha")}</h3>}
    <input type="hidden" name="mode" value={mode} />
    <div className={styles.field}><Label htmlFor="email">{t("E-mail")}</Label><Input id="email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} /></div>
    {mode !== "reset" && <div className={styles.field}><Label htmlFor="password">{t("Senha")}</Label><Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} maxLength={128} required disabled={busy} />{mode === "signup" && <small>{t("Use pelo menos 8 caracteres.")}</small>}</div>}
    <Button type="submit" className={styles.primaryButton} disabled={busy || !configured}>{t(busy ? "Aguarde…" : mode === "signup" ? "Criar minha conta" : mode === "reset" ? "Enviar link de recuperação" : "Entrar no meu caderno")}</Button>
    {emailAuthReady && <Button type="button" variant="link" className={styles.resetButton} disabled={busy} onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setMessage(""); }}>{t(mode === "reset" ? "Voltar para entrar" : "Esqueci minha senha")}</Button>}
  </form>;

  return <div className={styles.authArea}>
    {googleEnabled && <form action={async () => {
      setBusy(true); setMessage("");
      try { const result = await signInWithGoogle(); setMessage(result.error); } finally { setBusy(false); }
    }}>
      <Button type="submit" className={styles.googleButton} disabled={busy || !configured}><GoogleIcon />{t(busy ? "Aguarde…" : "Continuar com Google")}</Button>
      <p className={styles.googleNote}>{t("Use sua conta Google para entrar ou criar seu caderno.")}</p>
    </form>}
    {googleEnabled || emailDisclosure ? <details className={styles.emailDisclosure}><summary>{t(emailAuthReady ? "Prefiro usar e-mail e senha" : "Já tenho uma conta com e-mail")}<ChevronDown size={16} /></summary>{emailForm}</details> : emailForm}
    {(!configured || (!googleEnabled && !emailAuthReady)) && <p className={styles.message} role="status">{t("Estamos finalizando a abertura dos cadastros.")}</p>}
    {message && <p className={styles.message} role="status">{t(message)}</p>}
  </div>;
}
