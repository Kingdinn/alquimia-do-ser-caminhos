"use client";

import { Check, Heart, LockKeyhole, CloudMoon, Images, Sparkles, Orbit, Compass, CalendarDays, TrendingUp } from "lucide-react";
import { BloomFieldBackground } from "@/components/ui/journal-gradients";
import { Progress } from "@/components/ui/progress";
import { steps } from "@/app/content";
import { useI18n } from "@/lib/i18n";
import supportStyles from "./support-project-dialog.module.css";

type Props = {
  step: number;
  completed: boolean[];
  total: number;
  demo: boolean;
  motionPaused: boolean;
  onSelect: (step: number) => void;
  onSupport?: (trigger: HTMLButtonElement) => void;
};
const stageIcons = [CloudMoon, Images, Sparkles, Orbit, Compass, CalendarDays, TrendingUp];

export default function JourneyNavigation({ step, completed, total, demo, motionPaused, onSelect, onSupport }: Props) {
  const {t} = useI18n();
  return <div className="journey-navigation">
    <div className="sidebar-canvas" aria-hidden="true"><BloomFieldBackground paused={motionPaused} /></div>
    <button className="brand" onClick={() => onSelect(0)} aria-label={t("Alquimia do Ser — ir para Sonhar")}>
      <span className="brand-mark"><img src="/saturno-azul.svg" width={48} height={48} alt="" /></span>
      <span>Alquimia<br />do Ser<small>{t("CADERNO DE CAMINHOS")}</small></span>
    </button>
    <div className="side-label">{t("SETE ETAPAS. SEU RITMO.")}</div>
    <nav aria-label={t("Etapas do caderno")}>{steps.map((item, index) => { const StageIcon = stageIcons[index]; return <button
      key={item.short}
      className={`step${step === index ? " active" : ""}${completed[index] ? " started" : ""}`}
      onClick={() => onSelect(index)}
      aria-current={step === index ? "step" : undefined}
    >
      <span className="step-number"><StageIcon size={18} aria-hidden="true"/></span>
      <span><span className="stage-number">{String(index + 1).padStart(2, "0")}</span>{t(item.short)}<small>{t(item.title)}</small></span>
      {completed[index] && <Check className="step-check" size={15} aria-label={t("Etapa iniciada")} />}
      {step === index && !completed[index] && <span className="dot" />}
    </button>})}</nav>
    <div className="side-bottom">
      <div className="progress-label"><span>{t("Seu caminho ganha forma")}</span><b>{total}<span> / 7</span></b></div>
      <Progress value={total / 7 * 100} aria-label={t("Etapas iniciadas")} />
      <p>{t("Um passo por vez. Você pode voltar a qualquer etapa.")}</p>
      <span className="privacy"><LockKeyhole size={14} />{t(demo ? "Prévia sem armazenamento" : "Seu caderno é privado")}</span>
      {onSupport && <button type="button" className={supportStyles.sidebarTrigger} aria-haspopup="dialog" onClick={event => onSupport(event.currentTarget)}><Heart size={15} aria-hidden="true" />{t("Apoiar o projeto")}</button>}
    </div>
  </div>;
}
