"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { Pause, Play } from "lucide-react";
import styles from "./login.module.css";

type Props = { children: ReactNode; className: string; labelledBy: string };

export default function MotionScene({ children, className, labelledBy }: Props) {
  const { t } = useI18n();
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  return <section className={className} aria-labelledby={labelledBy} data-motion-paused={paused || reducedMotion}>
    {children}
    <button
      type="button"
      className={styles.motionToggle}
      aria-label={t(reducedMotion ? "Movimento reduzido conforme sua preferência" : paused ? "Retomar movimento do painel" : "Pausar movimento do painel")}
      aria-pressed={paused || reducedMotion}
      disabled={reducedMotion}
      onClick={() => setPaused(value => !value)}
    >
      {paused || reducedMotion ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
      <span>{t(reducedMotion ? "Movimento reduzido" : paused ? "Retomar movimento" : "Pausar movimento")}</span>
    </button>
  </section>;
}
