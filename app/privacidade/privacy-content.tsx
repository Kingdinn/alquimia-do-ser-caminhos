"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OrbitSweepBackground } from "@/components/ui/orbit-sweep";
import styles from "./privacy.module.css";
import LanguageSwitcher from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";

export default function PrivacyContent() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true"><OrbitSweepBackground /></div>
      <main className={styles.card}>
        <div className={styles.topbar}><Link href="/entrar" className={styles.backLink}><ArrowLeft size={16} aria-hidden="true" /> {t("Voltar à entrada")}</Link><LanguageSwitcher /></div>
        <header className={styles.header}>
          <Image src="/saturno-azul.svg" width={64} height={64} alt="" />
          <p className={styles.brand}>ALQUIMIA DO SER</p>
          <h1>{t("Privacidade")}<span>.</span></h1>
          <p className={styles.intro}>{t("Um resumo claro do que acontece com as informações que você coloca aqui.")}</p>
        </header>

        <div className={styles.sections}>
          <section aria-labelledby="sua-conta">
            <h2 id="sua-conta">{t("Sua conta")}</h2>
            <p>{t("Ao entrar com Google, o aplicativo recebe dados básicos de identidade, como nome, e-mail e foto do perfil, para associar o acesso à sua conta. O login usa cookies necessários para manter sua sessão.")}</p>
          </section>

          <section aria-labelledby="seu-caderno">
            <h2 id="seu-caderno">{t("Seu caderno")}</h2>
            <p>{t("Textos, metas, rotina, registros e imagens que você salva ficam associados à sua conta no Supabase. No aplicativo, cada pessoa acessa o próprio caderno; seu conteúdo não é publicado para os outros usuários. A aplicação é hospedada na Vercel.")}</p>
            <p>{t("As alterações são salvas automaticamente após uma breve pausa na edição. A indicação “Tudo salvo na sua conta” aparece após a confirmação do servidor. Se ocorrer um erro, a tela informa que o salvamento ainda está pendente.")}</p>
          </section>

          <section aria-labelledby="google-calendar">
            <h2 id="google-calendar">{t("Google Calendar opcional")}</h2>
            <p>{t("Ao conectar sua agenda, você autoriza a app a criar um calendário separado e gerenciar as atividades enviadas a ele. A conexão envia somente os títulos, datas, horários, durações e repetições das atividades agendadas. Textos, imagens, metas e registros pessoais do caderno não são enviados.")}</p>
            <p>{t("A sincronização funciona da app para o Google enquanto a app está aberta. Mudanças feitas no Google não voltam ao caderno. As credenciais da conexão são criptografadas no servidor. Desconectar remove essas credenciais e interrompe os próximos envios; os eventos já enviados continuam no Google.")}</p>
          </section>

          <section aria-labelledby="rascunhos">
            <h2 id="rascunhos">{t("Rascunhos neste aparelho")}</h2>
            <p>{t("Para ajudar a recuperar alterações após uma queda de conexão ou o fechamento da página, o aplicativo guarda rascunhos no armazenamento local deste navegador, separados por conta e por aba. Isso depende do espaço e das permissões do navegador; limpar seus dados ou usar navegação privada pode apagar esses rascunhos.")}</p>
            <p>{t("O rascunho da aba é removido após a confirmação do salvamento. Ao voltar, você pode recuperar ou descartar rascunhos pendentes de outras sessões. Sair da conta não apaga os rascunhos pendentes neste aparelho; eles voltam a ser oferecidos quando você entra com a mesma conta. Em aparelhos compartilhados, descarte os rascunhos que não deseja manter.")}</p>
          </section>

          <section aria-labelledby="idioma">
            <h2 id="idioma">{t("Preferência de idioma")}</h2>
            <p>{t("A escolha de idioma fica salva neste navegador, quando o armazenamento local está disponível. Ela não é vinculada à sua conta e pode ser alterada a qualquer momento.")}</p>
          </section>

          <section aria-labelledby="demonstracao">
            <h2 id="demonstracao">{t("Demonstração")}</h2>
            <p>{t("O que você preenche na demonstração fica apenas na memória daquela página e se perde ao recarregar ou fechar.")}</p>
          </section>

          <section aria-labelledby="musica">
            <h2 id="musica">{t("Música opcional")}</h2>
            <p>{t("A música é opcional e começa quando você aperta play. O arquivo de áudio é servido pelo próprio aplicativo, sem carregar um player externo. Recolher os controles mantém a reprodução; use Pausar quando quiser interrompê-la. Os textos do caderno não são enviados para reproduzir a música.")}</p>
            <p>{t("A faixa")} <a href="https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100760" target="_blank" rel="noopener noreferrer">Organic Meditations One, {t("de")} Kevin MacLeod (incompetech.com)</a> {t("é usada sem alterações sob a licença")} <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">{t("Creative Commons Atribuição 4.0")}</a>. <a href="/audio/credits.txt" target="_blank" rel="noopener noreferrer">{t("Ver créditos da música")}</a>.</p>
          </section>

          <section aria-labelledby="suas-escolhas">
            <h2 id="suas-escolhas">{t("Editar, exportar e excluir")}</h2>
            <p>{t("Você pode editar o caderno com salvamento automático ou usar “Salvar agora”. No caderno com conta, retirar uma imagem do mural salva o estado atual e solicita a exclusão do arquivo do armazenamento. Se a exclusão não terminar, o aplicativo permite tentar novamente.")}</p>
            <p>{t("A opção Exportar baixa um arquivo JSON com textos e referências. Os arquivos das imagens não acompanham essa exportação.")}</p>
          </section>

          <section aria-labelledby="contato" className={styles.contact}>
            <h2 id="contato">{t("Falar com Din")}</h2>
            <p>{t("Para dúvidas ou para solicitar a exclusão completa da conta, do caderno e das imagens vinculadas, escreva para")} <a href="mailto:cortescora25@gmail.com">cortescora25@gmail.com</a> {t("usando o e-mail da sua conta.")}</p>
            <p>{t("Esse pedido é feito por contato; ainda não existe um botão de exclusão da conta no aplicativo. Não envie sua senha.")}</p>
          </section>
        </div>

        <footer className={styles.footer}>
          <Link href="/entrar"><ArrowLeft size={16} aria-hidden="true" /> {t("Voltar à entrada")}</Link>
          <span>{t("Presença antes de perfeição.")}</span>
        </footer>
      </main>
    </div>
  );
}
