import LanguageSwitcher from "@/components/language-switcher";
import { Trans } from "@/lib/i18n";

export default function Page() {
  return <main className="login-page"><section className="login-card">
    <LanguageSwitcher />
    <h1><Trans text="Link indisponível" /></h1>
    <p className="login-intro"><Trans text="Este link pode ter expirado ou já ter sido usado. Volte para entrar ou solicitar outro e-mail." /></p>
    <a href="/entrar"><Trans text="Voltar para entrar" /></a>
  </section></main>;
}
