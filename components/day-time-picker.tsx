"use client";

import {useId, useState} from "react";
import {ChevronDown, ChevronUp, Clock3, SlidersHorizontal} from "lucide-react";
import {useI18n} from "@/lib/i18n";
import type {Block} from "@/app/content";
import {getAvailableHourSlots, type DayReservation} from "@/lib/day-availability";
import styles from "./day-time-picker.module.css";

type Props = {
  date: string;
  blocks: Block[];
  disabled: boolean;
  onPick: (time: string, duration: string) => void;
  onOther: (duration: string) => void;
};
const durations = [15, 30, 60, 90] as const;
const conflictNames = (conflicts: DayReservation[], t: (key: string) => string) => [...new Set(conflicts.map(({block}) => block.activity.trim() || t("Compromisso sem título")))].join(" · ");

export default function DayTimePicker({date, blocks, disabled, onPick, onOther}: Props) {
  const {t} = useI18n();
  const [duration, setDuration] = useState<number>(60);
  const [allHours, setAllHours] = useState(false);
  const id = useId();
  let slots: ReturnType<typeof getAvailableHourSlots> = [];
  let error = "";
  try {
    // Always consider the whole notebook, including goals hidden by a calendar filter.
    slots = getAvailableHourSlots(blocks, date, duration);
  } catch (problem) {
    error = problem instanceof Error ? problem.message : t("Escolha uma data válida para consultar os horários.");
  }
  const visibleSlots = allHours ? slots : slots.filter(slot => slot.time >= "06:00" && slot.time <= "22:00");
  const freeCount = visibleSlots.filter(slot => slot.available).length;

  return <section className={styles.picker} aria-labelledby={`${id}-title`}>
    <header className={styles.header}>
      <div className={styles.heading}><span className={styles.icon}><Clock3 size={19}/></span><div><h3 id={`${id}-title`}>{t("Escolha um horário")}</h3><p>{t("Primeiro, separe um tempo para você.")}</p></div></div>
      <div className={styles.duration}><span id={`${id}-duration`}>{t("Quanto tempo?")}</span><div className={styles.presets} role="group" aria-labelledby={`${id}-duration`}>{durations.map(minutes => <button className={styles.preset} key={minutes} type="button" disabled={disabled} aria-pressed={duration === minutes} onClick={() => setDuration(minutes)}>{minutes}<span> min</span></button>)}</div></div>
    </header>
    {error ? <p className={styles.message} role="status">{t(error)}</p> : <>
      <div className={styles.availability}><p role="status">{freeCount ? t(freeCount === 1 ? t("{count} opção livre para {duration} minutos") : t("{count} opções livres para {duration} minutos"), {count: freeCount, duration}) : t("Nenhum horário livre nesta faixa para {duration} minutos", {duration})}</p><span>{allHours ? t("00h–23h") : t("06h–22h")}</span></div>
      <div className={styles.grid} id={`${id}-hours`} aria-label={t("Horários para {duration} minutos", {duration})}>
        {visibleSlots.map(slot => {
          const conflict = conflictNames(slot.conflicts, t);
          const conflictDescription = slot.conflicts.map(reservation => `${reservation.block.activity.trim() || t("Compromisso sem título")}${reservation.continuesFromPreviousDay ? t(" (continua do dia anterior)") : ""}`).join("; ");
          return <button key={slot.time} type="button" className={styles.slot} data-available={slot.available} disabled={disabled || !slot.available} aria-label={slot.available ? t("Escolher {time}, por {duration} minutos", {time: slot.time, duration}) : t("{time} reservado. Conflito com {conflict}.", {time: slot.time, conflict: conflictDescription || t("outro compromisso")})} title={slot.available ? t("{duration} minutos livres no seu caderno", {duration}) : t("Reservado: {conflict}", {conflict: conflict || t("outro compromisso")})} onClick={() => onPick(slot.time, String(duration))}>
            <strong>{slot.time}</strong><span className={styles.slotStatus}>{slot.available ? t("Livre") : t("Reservado")}</span>{!slot.available && <small className={styles.conflict}>{conflict || t("Outro compromisso")}</small>}
          </button>;
        })}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.toggle} disabled={disabled} aria-expanded={allHours} aria-controls={`${id}-hours`} onClick={() => setAllHours(current => !current)}>{allHours ? t("Mostrar das 06h às 22h") : t("Ver todos os horários")}{allHours ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
        <button type="button" className={styles.other} disabled={disabled} onClick={()=>onOther(String(duration))}><SlidersHorizontal size={15}/>{" " + t("Outro horário")}</button>
      </div>
    </>}
    <p className={styles.note}>{t("A disponibilidade considera apenas os compromissos deste caderno. Para começar às 18:30, por exemplo, escolha “Outro horário”. Você confirma os detalhes antes de adicionar.")}</p>
  </section>;
}
