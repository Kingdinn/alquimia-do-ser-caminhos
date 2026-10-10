"use client";

import { OrbitSweepBackground } from "@/components/ui/orbit-sweep";
import AuthForm from "./auth-form";
import LanguageSwitcher from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ArrowRight, LockKeyhole } from "lucide-react";
import styles from "./login.module.css";
import MotionScene from "./motion-scene";

const journey = ["Sonhar", "Visualizar", "Ser", "Envisionar", "Planejar", "Praticar", "Acompanhar"];

function OrbitalArtwork() {
  const petals = [[366, 178], [333, 235], [267, 235], [234, 178], [267, 121], [333, 121]];
  const stars = [[62, 98, 2], [135, 291, 2], [455, 77, 2.5], [520, 245, 2], [406, 299, 1.5], [91, 232, 1.5], [487, 152, 1.5]];
  return <div className={styles.orbitalArtwork} aria-hidden="true">
    <span className={styles.artAura} />
    <svg viewBox="0 0 600 360" fill="none" className={styles.orbitalSvg}>
      <defs>
        <radialGradient id="login-planet" cx=".28" cy=".22" r=".9"><stop stopColor="#ecffff" /><stop offset=".22" stopColor="#73e8f5" /><stop offset=".55" stopColor="#718aff" /><stop offset="1" stopColor="#3b2399" /></radialGradient>
        <linearGradient id="login-orbit" x1="145" y1="40" x2="455" y2="315" gradientUnits="userSpaceOnUse"><stop stopColor="#66e9f2" /><stop offset=".5" stopColor="#ccbdff" /><stop offset="1" stopColor="#8579fa" /></linearGradient>
        <linearGradient id="login-saturn-ring" x1="180" y1="245" x2="398" y2="100" gradientUnits="userSpaceOnUse"><stop stopColor="#61d5ec" /><stop offset=".45" stopColor="#f0e6ff" /><stop offset="1" stopColor="#a3a9ff" /></linearGradient>
        <filter id="login-orbit-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5" /></filter>
      </defs>
      <path d="M52 263C166 251 420 105 551 94" stroke="url(#login-orbit)" strokeOpacity=".32" />
      <path d="M89 75C206 42 440 310 524 292" stroke="url(#login-orbit)" strokeOpacity=".24" />
      <g className={styles.mandala} stroke="url(#login-orbit)">
        <circle cx="300" cy="178" r="146" strokeOpacity=".6" />
        <circle cx="300" cy="178" r="130" strokeOpacity=".28" strokeDasharray="1 11" strokeLinecap="round" strokeWidth="2" />
        <circle cx="300" cy="178" r="105" strokeOpacity=".38" />
        {petals.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="66" strokeOpacity=".5" />)}
        <path d="M300 32L426 251H174L300 32ZM300 324L174 105H426L300 324Z" strokeOpacity=".35" />
        <circle cx="300" cy="32" r="4" fill="#d8deff" stroke="none" />
        <circle cx="173.5" cy="251" r="3" fill="#a8b1ff" stroke="none" />
        <circle cx="426.5" cy="251" r="3" fill="#76e9ef" stroke="none" />
      </g>
      <g className={styles.planet}>
        <ellipse cx="300" cy="178" rx="105" ry="32" transform="rotate(-24 300 178)" stroke="url(#login-saturn-ring)" strokeWidth="2" strokeOpacity=".7" />
        <circle cx="300" cy="178" r="52" fill="url(#login-planet)" />
        <path d="M276 140C290 124 318 132 331 147" stroke="#e6ffff" strokeOpacity=".35" strokeWidth="1.5" />
        <path d="M201 220C218 235 365 190 395 140" stroke="url(#login-saturn-ring)" strokeWidth="8" strokeOpacity=".2" filter="url(#login-orbit-glow)" />
        <path d="M201 220C218 235 365 190 395 140" stroke="url(#login-saturn-ring)" strokeWidth="2.5" />
      </g>
      <g className={styles.artStars} fill="#c6e7ff">{stars.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}</g>
      <path d="M454 63V90M440.5 76.5H467.5" stroke="#c9edff" strokeWidth="1" />
      <path d="M125 282V302M115 292H135" stroke="#a9abff" />
    </svg>
  </div>;
}

type Props = { signedIn: boolean; userEmail?: string; configured: boolean; googleEnabled: boolean; emailAuthReady: boolean };

export default function LoginView({ signedIn, userEmail, configured, googleEnabled, emailAuthReady }: Props) {
  const { t } = useI18n();
  const pending = !googleEnabled && !emailAuthReady;

  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <MotionScene className={styles.introPanel} labelledBy="welcome-title">
          <div className={styles.atmosphere} aria-hidden="true"><OrbitSweepBackground /></div>
          <div className={styles.colorMist} aria-hidden="true"><i /><i /></div>
          <a href="/entrar" className={styles.brand} aria-label={t("Alquimia do Ser, entrada")}>
            <span className={styles.brandIcon} aria-hidden="true" />
            <span>Alquimia do Ser<small>{t("Caderno de caminhos")}</small></span>
          </a>
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}>{t("DE DENTRO PARA FORA")}</p>
            <h1 id="welcome-title">{t("Dê espaço ao")}<br />{t("que quer")} <em>{t("viver.")}</em></h1>
            <p>{t("Um lugar para escutar seus sonhos, escolher seu caminho e cultivar os pequenos passos de cada dia.")}</p>
          </div>
          <OrbitalArtwork />
          <div className={styles.journey}>
            <ol aria-label={t("Sete etapas. No seu ritmo.")}>{journey.map(stage => <li key={stage}>{t(stage)}</li>)}</ol>
          </div>
        </MotionScene>
        <section className={styles.formPanel} aria-labelledby="access-title">
          <div className={styles.languageChoice}><LanguageSwitcher /></div>
          <div className={styles.mobileBrand}><span className={styles.brandIcon} aria-hidden="true" /><span>Alquimia do Ser</span></div>
          <div className={styles.formContent}>
            <p className={styles.formEyebrow}>{t("SEU ESPAÇO PESSOAL")}</p>
            <h2 id="access-title">{t("Seu caderno,")}<br />{t("seu caminho")}<span>.</span></h2>
            <p className={styles.formIntro}>{t(signedIn ? "Continue de onde você parou." : pending ? "Conheça o caderno enquanto preparamos o acesso às contas." : "Entre para continuar sua jornada. Seus registros ficam vinculados à sua conta.")}</p>
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
            <div className={styles.privacy}><LockKeyhole size={16} /><span>{t("Cada pessoa tem seu próprio caderno.")}</span></div>
            {!pending && <a className={styles.demoLink} href="/demonstracao">{t("Conhecer antes de entrar")} <ArrowRight size={15} /><small>{t("Uma prévia; os registros ficam só nesta página.")}</small></a>}
          </div>
          <a className={styles.privacyLink} href="/privacidade">{t("Privacidade e seus dados")}</a>
        </section>
      </div>
    </main>
  );
}
