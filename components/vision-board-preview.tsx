"use client";

import { useId } from "react";
import { useI18n } from "@/lib/i18n";

/** Decorative invitations, never images belonging to the visitor's notebook. */
export default function VisionBoardPreview() {
  const {t} = useI18n();
  const id = useId().replace(/:/g, "");
  return <div className="board-constellation" aria-hidden="true">
    <div className="board-orbit" />
    <div className="inspiration-frame inspiration-landscape">
      <svg viewBox="0 0 240 280" focusable="false">
        <defs><linearGradient id={`${id}-dawn`} x2="0" y2="1"><stop stopColor="#242463"/><stop offset=".6" stopColor="#7374c9"/><stop offset="1" stopColor="#e3c9ee"/></linearGradient></defs>
        <rect width="240" height="280" fill={`url(#${id}-dawn)`}/>
        <circle cx="164" cy="76" r="35" fill="#ece7ff"/>
        <path d="M0 222 70 130 140 219 208 173 240 209V280H0Z" fill="#354582"/>
        <path d="M0 251 84 199 147 253 212 207 240 239V280H0Z" fill="#192e56"/>
        <path d="M0 269 Q60 235 122 269 T240 266V280H0Z" fill="#112338"/>
        {[24,62,88,134,196,212].map((x,i)=><circle key={x} cx={x} cy={24+(i*29)%77} r="1.1" fill="#fff" opacity=".65"/>)}
      </svg><span>{t("Lugares para viver")}</span>
    </div>
    <div className="inspiration-frame inspiration-resonance">
      <svg viewBox="0 0 240 280" focusable="false">
        <defs><radialGradient id={`${id}-resonance`}><stop stopColor="#30e5de"/><stop offset=".4" stopColor="#3d75c8"/><stop offset="1" stopColor="#222559"/></radialGradient></defs>
        <rect width="240" height="280" fill={`url(#${id}-resonance)`}/>
        {[26,44,65,87].map(r=><circle key={r} cx="120" cy="128" r={r} fill="none" stroke="#b3fcf0" strokeWidth=".7" opacity=".5"/>)}
        <path d="M21 156 Q48 77 75 156 T129 156T183 156T237 156" fill="none" stroke="#edfffe" strokeWidth="2"/>
        <path d="M21 167 Q48 88 75 167 T129 167T183 167T237 167" fill="none" stroke="#edfffe" strokeWidth=".6" opacity=".4"/>
      </svg><span>{t("O que faz sentir")}</span>
    </div>
    <div className="inspiration-frame inspiration-sky">
      <svg viewBox="0 0 240 280" focusable="false">
        <defs><linearGradient id={`${id}-sky`} x2="1" y2="1"><stop stopColor="#151d42"/><stop offset="1" stopColor="#654bd2"/></linearGradient></defs>
        <rect width="240" height="280" fill={`url(#${id}-sky)`}/>
        <circle cx="126" cy="131" r="45" fill="#bcc7ff"/>
        <ellipse cx="126" cy="131" rx="82" ry="20" fill="none" stroke="#e4e6ff" strokeWidth="7" transform="rotate(-28 126 131)"/>
        <path d="m177 50 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z" fill="#c2f8f2"/>
        {[28,64,87,151,204,220].map((x,i)=><circle key={x} cx={x} cy={30+(i*47)%209} r="1.4" fill="#fff" opacity=".7"/>)}
      </svg><span>{t("Novas possibilidades")}</span>
    </div>
  </div>;
}
