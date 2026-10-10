"use client";

import AuthForm from "./auth-form";
import LanguageSwitcher from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowRight, LockKeyhole } from "lucide-react";
import styles from "./login.module.css";

type Props = { signedIn: boolean; userEmail?: string; configured: boolean; googleEnabled: boolean; emailAuthReady: boolean };

export default function LoginView({ signedIn, userEmail, configured, googleEnabled, emailAuthReady }: Props) {
  const { t } = useI18n();
  const pending = !googleEnabled && !emailAuthReady;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <a href="/entrar" className={styles.brand} aria-label={t("Alquimia do Ser, entrada")}>
            <img src="/saturno-azul.svg" width={38} height={38} alt="" />
            <span>Alquimia do Ser</span>
          </a>
          <LanguageSwitcher />
        </header>

        <section className={styles.card} aria-labelledby="access-title">
          <p className={styles.eyebrow}>{t("SEU ESPAÇO PESSOAL")}</p>
          <h1 id="access-title">{t("Seu caderno,")}<br />{t("seu caminho")}<span>.</span></h1>
          <p className={styles.intro}>{t(signedIn ? "Continue de onde você parou." : pending ? "Conheça o caderno enquanto preparamos o acesso às contas." : "Entre para continuar sua jornada. Seus registros ficam vinculados à sua conta.")}</p>

          {signedIn ? <>
            <p className={styles.account}>{t("Conectado como")} <strong>{userEmail}</strong></p>
            <Button asChild className={styles.primaryButton}><a href="/">{t("Abrir meu caderno")} <ArrowRight size={18} /></a></Button>
          </> : <>
            {pending && <div className={styles.preview}>
              <Button asChild className={styles.primaryButton}><a href="/demonstracao">{t("Explorar o caderno")} <ArrowRight size={18} /></a></Button>
              <small>{t("A prévia não salva na conta. O acesso às contas ainda está sendo preparado.")}</small>
            </div>}
            <AuthForm configured={configured} googleEnabled={googleEnabled} emailAuthReady={emailAuthReady} emailDisclosure={pending} />
          </>}

          <p className={styles.privacy}><LockKeyhole size={15} /><span>{t("Cada pessoa tem seu próprio caderno.")}</span></p>
          {!pending && <a className={styles.demoLink} href="/demonstracao">{t("Conhecer antes de entrar")} <ArrowRight size={15} /></a>}
        </section>

        <footer className={styles.footer}>
          <span>{t("Presença antes de perfeição.")}</span>
          <a href="/privacidade">{t("Privacidade e seus dados")}</a>
        </footer>
      </div>
    </main>
  );
}
