"use client";

import { useId, type ReactNode, type Ref } from "react";
import OrbitalSphereBackground from "@/components/ui/orbital-sphere";
import { steps } from "@/app/content";
import { useI18n } from "@/lib/i18n";
import styles from "./journey-hero.module.css";

export type JourneyHeroProps = {
  step: number;
  total: number;
  textLength: number;
  imageCount: number;
  goalCount: number;
  blockCount: number;
  checkinCount: number;
  motionPaused: boolean;
  children?: ReactNode;
  headingRef: Ref<HTMLHeadingElement>;
};

const invitations = [
  "Comece com um desejo. Deixe a escrita abrir espaço.",
  "Escolha pelo que sente, além do que os olhos veem.",
  "Uma virtude ganha vida em um pequeno gesto.",
  "Imagine um horizonte. Abra espaço para o inesperado.",
  "Poucos focos. Um próximo passo possível.",
  "Proteja o importante. Deixe espaço para respirar.",
  "Observe com gentileza. Ajustar também é avançar.",
];
const stars = Array.from({ length: 46 }, (_, index) => ({
  x: 12 + ((index * 83) % 432),
  y: 10 + ((index * 59) % 326),
  radius: index % 7 === 0 ? 1.6 : index % 3 === 0 ? 1 : 0.6,
  opacity: 0.24 + (index % 5) * 0.12,
}));
const geometryPoints = Array.from({ length: 6 }, (_, index) => {
  const angle = (index * Math.PI) / 3 - Math.PI / 2;
  return { x: 247 + Math.cos(angle) * 125, y: 162 + Math.sin(angle) * 125 };
});

function CosmicInstrument({ id, motto }: { id: string; motto: string }) {
  const planet = `${id}-planet`;
  const ring = `${id}-ring`;
  const halo = `${id}-halo`;
  const clip = `${id}-clip`;

  return (
    <svg className={styles.instrument} viewBox="0 0 460 350" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={halo}>
          <stop stopColor="var(--cosmic-luminous)" stopOpacity=".24" />
          <stop offset=".5" stopColor="var(--cosmic-soft)" stopOpacity=".12" />
          <stop offset="1" stopColor="var(--cosmic-soft)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={planet} cx=".32" cy=".24" r=".86">
          <stop stopColor="#d6edff" />
          <stop offset=".19" stopColor="var(--cosmic-luminous)" />
          <stop offset=".51" stopColor="var(--cosmic-accent)" />
          <stop offset=".8" stopColor="#324779" />
          <stop offset="1" stopColor="#121d3c" />
        </radialGradient>
        <linearGradient id={ring} x1="92" y1="164" x2="406" y2="164" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--cosmic-luminous)" stopOpacity=".12" />
          <stop offset=".3" stopColor="#d2e9ff" stopOpacity=".84" />
          <stop offset=".64" stopColor="var(--cosmic-accent)" />
          <stop offset="1" stopColor="var(--cosmic-luminous)" stopOpacity=".32" />
        </linearGradient>
        <clipPath id={clip}><circle cx="247" cy="162" r="71" /></clipPath>
      </defs>

      <circle cx="247" cy="162" r="168" fill={`url(#${halo})`} />
      <g className={styles.starfield} fill="#d5e5ff">
        {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.radius} opacity={star.opacity} />)}
      </g>
      <g className={styles.constellations} stroke="var(--cosmic-luminous)" strokeWidth=".7">
        <path d="m22 237 27-35 37 11 17-35M344 39l26 20 29-17 20 31M24 73l33 15 14-32" opacity=".22" />
        <path d="M39 144h12m-6-6v12M399 231h14m-7-7v14M132 43h10m-5-5v10" opacity=".8" />
        <circle cx="49" cy="202" r="2" fill="var(--cosmic-luminous)" stroke="none" />
        <circle cx="370" cy="59" r="1.8" fill="var(--cosmic-luminous)" stroke="none" />
      </g>

      <g className={styles.geometry} stroke="var(--cosmic-luminous)" strokeWidth=".55">
        <circle cx="247" cy="162" r="125" opacity=".3" />
        <circle cx="247" cy="162" r="137" opacity=".16" strokeDasharray="1 7" />
        <polygon points={geometryPoints.map(point => `${point.x},${point.y}`).join(" ")} opacity=".26" />
        <path d={`M${geometryPoints[0].x} ${geometryPoints[0].y}L${geometryPoints[2].x} ${geometryPoints[2].y}L${geometryPoints[4].x} ${geometryPoints[4].y}Z M${geometryPoints[1].x} ${geometryPoints[1].y}L${geometryPoints[3].x} ${geometryPoints[3].y}L${geometryPoints[5].x} ${geometryPoints[5].y}Z`} opacity=".2" />
        {Array.from({ length: 6 }, (_, index) => {
          const angle = (index * Math.PI) / 3;
          return <circle key={index} cx={247 + Math.cos(angle) * 60} cy={162 + Math.sin(angle) * 60} r="60" opacity=".16" />;
        })}
        {geometryPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="2.5" fill="var(--cosmic-luminous)" fillOpacity=".7" stroke="none" />)}
      </g>

      <g className={styles.outerOrbit} stroke="var(--cosmic-accent)">
        <ellipse cx="247" cy="162" rx="194" ry="105" transform="rotate(17 247 162)" strokeWidth=".7" opacity=".26" />
        <ellipse cx="247" cy="162" rx="160" ry="132" transform="rotate(-28 247 162)" strokeWidth=".6" opacity=".2" strokeDasharray="3 10" />
        <circle cx="419" cy="239" r="5" fill="var(--cosmic-accent)" fillOpacity=".3" strokeWidth=".7" />
        <circle cx="419" cy="239" r="1.5" fill="#deefff" stroke="none" />
      </g>

      <g className={styles.saturn}>
        <g transform="rotate(-24 247 162)" stroke={`url(#${ring})`}>
          <ellipse cx="247" cy="162" rx="158" ry="43" strokeWidth="13" opacity=".1" />
          {[0, 1, 2, 3, 4, 5, 6].map(index => <ellipse key={index} cx="247" cy="162" rx={145 + index * 3} ry={36 + index * 1.5} strokeWidth={index === 3 ? "1.5" : ".65"} opacity={index === 3 ? ".9" : ".46"} />)}
        </g>
        <circle cx="247" cy="162" r="74" fill="var(--cosmic-luminous)" fillOpacity=".07" />
        <circle cx="247" cy="162" r="71" fill={`url(#${planet})`} />
        <g clipPath={`url(#${clip})`} transform="rotate(-24 247 162)">
          <path d="M169 116c48 21 102 21 156-1M173 123c49 24 105 24 155-1M170 132c53 23 108 23 160-1" stroke="#f3fbff" strokeOpacity=".14" strokeWidth="2" />
          <path d="M165 147c57 21 107 23 167 3M165 155c54 20 111 22 171 1M164 172c55 16 113 18 172-2M170 187c52 14 105 14 157-3M177 201c49 12 95 12 143-3" stroke="#091835" strokeOpacity=".2" strokeWidth="4" />
          <path d="M176 139c51 20 98 23 149 3M169 162c53 20 108 22 161 0M181 194c46 11 91 10 137-2" stroke="#eaf9ff" strokeOpacity=".1" strokeWidth="1" />
          <ellipse cx="207" cy="131" rx="31" ry="48" fill="#e0ffff" fillOpacity=".07" />
        </g>
        <circle cx="247" cy="162" r="71" stroke="#d6efff" strokeOpacity=".24" strokeWidth=".6" />
        <g transform="rotate(-24 247 162)" stroke={`url(#${ring})`}>
          {[0, 1, 2, 3, 4, 5, 6].map(index => {
            const rx = 145 + index * 3;
            const ry = 36 + index * 1.5;
            return <path key={index} d={`M${247 - rx} 162a${rx} ${ry} 0 0 0 ${rx * 2} 0`} strokeWidth={index === 3 ? "1.8" : ".75"} opacity={index === 3 ? ".95" : ".6"} />;
          })}
        </g>
      </g>

      <g stroke="var(--cosmic-luminous)" strokeWidth=".7" opacity=".47">
        <path d="M50 291h70m-66 5h58m-54 5h50m-46 5h42m-38 5h34" />
        <path d="M80 291v-17l13-4v24M344 282v-20l14-5v20" />
        <ellipse cx="77" cy="294" rx="3.5" ry="2" fill="var(--cosmic-luminous)" />
        <ellipse cx="90" cy="297" rx="3.5" ry="2" fill="var(--cosmic-luminous)" />
        <ellipse cx="341" cy="284" rx="3.5" ry="2" fill="var(--cosmic-luminous)" />
        <ellipse cx="355" cy="279" rx="3.5" ry="2" fill="var(--cosmic-luminous)" />
      </g>
      <g fill="#b8d5ef" opacity=".46" fontFamily="Georgia, serif" fontSize="8" letterSpacing="2.3">
        <text x="144" y="332">{motto}</text>
      </g>
    </svg>
  );
}

function MetricMark({ step }: { step: number }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true" focusable="false">
    {step === 1 ? <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.5" /><path d="m5 17 5-5 3 3 3-4 4 5" /></> : step === 4 ? <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><path d="m12 12 8-8m-4 0h4v4" /></> : step === 5 ? <><rect x="4" y="6" width="16" height="14" rx="3" /><path d="M8 3v6m8-6v6M4 11h16m-10 4h4" /></> : step === 6 ? <><path d="M12 3a9 9 0 1 1-8 5M4 3v5h5m3-1v5l3 2" /></> : <><path d="M5 20h14M7 16l2-6 9-7 3 3-8 9-6 1Zm2-6 4 5" /></>}
  </svg>;
}

export default function JourneyHero({ step, total, textLength, imageCount, goalCount, blockCount, checkinCount, motionPaused, children, headingRef }: JourneyHeroProps) {
  const {locale, t} = useI18n();
  const numberFormat = new Intl.NumberFormat(locale);
  const id = useId().replace(/:/g, "");
  const stage = steps[step];
  const metric = step === 1 ? { value: imageCount, singular: "imagem no mural", plural: "imagens no mural" }
    : step === 4 ? { value: goalCount, singular: "meta criada", plural: "metas criadas" }
    : step === 5 ? { value: blockCount, singular: "bloco planejado", plural: "blocos planejados" }
    : step === 6 ? { value: checkinCount, singular: "revisão registrada", plural: "revisões registradas" }
    : { value: textLength, singular: "caractere escrito", plural: "caracteres escritos" };
  const ringLength = 2 * Math.PI * 16;

  return <section className={styles.root} data-step={step} data-motion-paused={motionPaused} aria-labelledby={`${id}-heading`}>
    <div className={styles.aurora} aria-hidden="true" />
    <div className={styles.horizon} aria-hidden="true" />
    <div className={styles.heroBody}>
      <div className={styles.copy}>
        <div className={styles.eyebrow}><span className={styles.chapter}>{String(step + 1).padStart(2, "0")}</span><span>{t("DE DENTRO PARA FORA")}</span></div>
        <h1 id={`${id}-heading`} ref={headingRef} tabIndex={-1} className={styles.heading}>{t(stage.title)}<span aria-hidden="true">.</span></h1>
        <p className={styles.subtitle}>{t(stage.subtitle)}</p>
        {children && <div className={styles.statusBody}>{children}</div>}
      </div>
      <div className={styles.art} aria-hidden="true">
        <span className={styles.artLabel}>ALQUIMIA DO SER <span>·</span> {String(step + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span>
        <CosmicInstrument id={id} motto={t("IMAGINAR · CULTIVAR · VIVER")} />
        <OrbitalSphereBackground className={styles.orbitalSphere} paused={motionPaused} />
      </div>
    </div>
    <div className={styles.bento}>
      <dl className={styles.metricCard}>
        <div className={styles.orbitMeter} aria-hidden="true"><svg viewBox="0 0 42 42" fill="none"><circle cx="21" cy="21" r="16" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.5" /><circle cx="21" cy="21" r="16" stroke="currentColor" strokeWidth="1.5" strokeDasharray={`${ringLength * (total / steps.length)} ${ringLength}`} transform="rotate(-90 21 21)" strokeLinecap="round" /><circle cx="21" cy="21" r="3" fill="currentColor" fillOpacity=".8" /></svg></div>
        <div><dt>{t(total === 1 ? "Etapa iniciada" : "Etapas iniciadas")}</dt><dd>{total}<span> / {steps.length}</span></dd></div>
      </dl>
      <dl className={styles.metricCard}>
        <div className={styles.metricIcon}><MetricMark step={step} /></div>
        <div><dt>{t(metric.value === 1 ? metric.singular : metric.plural)}</dt><dd>{numberFormat.format(metric.value)}</dd></div>
      </dl>
      <aside className={styles.invitation}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true" focusable="false"><path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3Z" /><circle cx="12" cy="12" r="3" /></svg>
        <div><span>{t("UM CONVITE")}</span><p>{t(invitations[step])}</p></div>
      </aside>
    </div>
  </section>;
}
