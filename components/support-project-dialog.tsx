"use client";

import {useEffect, useId, useRef, useState, type ComponentProps} from "react";
import {Check, Copy, ExternalLink, Heart, X} from "lucide-react";
import {useI18n} from "@/lib/i18n";
import type {SupportConfig} from "@/lib/support-config";
import {Button} from "@/components/ui/button";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import styles from "./support-project-dialog.module.css";

type Props = {
  config: SupportConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
};
type CopyState = "idle" | "copying" | "copied" | "failed";

export default function SupportProjectDialog({config, open, onOpenChange, onCloseAutoFocus}: Props) {
  const {t} = useI18n();
  const id = useId();
  const pixField = useRef<HTMLTextAreaElement>(null);
  const copyRequest = useRef(0);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    copyRequest.current++;
    setCopyState("idle");
    return () => {copyRequest.current++;};
  }, [open, config.pixCode]);

  function changeOpen(next: boolean) {
    if (!next) {copyRequest.current++; setCopyState("idle");}
    onOpenChange(next);
  }

  async function copyPix() {
    if (!config.pixCode || copyState === "copying") return;
    const request = ++copyRequest.current;
    setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(config.pixCode);
      if (request === copyRequest.current) setCopyState("copied");
    } catch {
      if (request !== copyRequest.current) return;
      setCopyState("failed");
      pixField.current?.focus();
      pixField.current?.select();
    }
  }

  if (!config.pixCode && !config.internationalUrl) return null;

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogContent className={styles.dialog} showCloseButton={false} onCloseAutoFocus={onCloseAutoFocus}>
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="icon" className={styles.closeButton} aria-label={t("Fechar apoio ao projeto")}><X aria-hidden="true" /></Button>
      </DialogClose>
      <DialogHeader>
        <span className={styles.symbol} aria-hidden="true"><Heart size={22} /></span>
        <DialogTitle>{t("Apoiar Alquimia")}</DialogTitle>
        <DialogDescription>{t("O Alquimia do Ser é gratuito. Seu apoio é voluntário e ajuda Din a continuar criando e cuidando deste espaço.")}</DialogDescription>
      </DialogHeader>

      {config.pixCode && <section className={styles.method} aria-labelledby={`${id}-pix-title`}>
        <h3 id={`${id}-pix-title`}>{t("Apoio via Pix")}</h3>
        <p>{t("Copie o código e abra o Pix Copia e Cola no aplicativo do seu banco.")}</p>
        <label htmlFor={`${id}-pix-code`}>{t("Código Pix Copia e Cola")}</label>
        <textarea
          ref={pixField}
          id={`${id}-pix-code`}
          className={styles.pixCode}
          aria-describedby={`${id}-pix-check`}
          value={config.pixCode}
          readOnly
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
        />
        <Button type="button" className={styles.action} disabled={copyState === "copying"} onClick={() => void copyPix()}>
          {copyState === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {t(copyState === "copying" ? "Copiando…" : "Copiar código Pix")}
        </Button>
        <p className={styles.copyStatus} role="status" aria-live="polite" aria-atomic="true">{copyState === "copied" ? t("Código Pix copiado.") : copyState === "failed" ? t("Não foi possível copiar. Selecione o código e copie manualmente.") : ""}</p>
        <p id={`${id}-pix-check`} className={styles.note}>{t("Confira o nome de quem recebe e o valor no aplicativo do banco antes de confirmar.")}</p>
      </section>}

      {config.internationalUrl && <section className={styles.method} aria-labelledby={`${id}-international-title`}>
        <h3 id={`${id}-international-title`}>{t("Apoio internacional")}</h3>
        <p>{t("Você continuará em um serviço de pagamento externo.")}</p>
        <Button asChild variant="outline" className={styles.action}>
          <a href={config.internationalUrl} target="_blank" rel="noopener noreferrer" aria-label={t("Apoiar por link internacional (abre em nova aba)")}>{t("Apoiar por link internacional")} <ExternalLink aria-hidden="true" /></a>
        </Button>
        <small className={styles.note}>{t("Abre em nova aba.")}</small>
      </section>}
    </DialogContent>
  </Dialog>;
}
