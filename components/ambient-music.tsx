"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Music2, Pause, Play, SlidersHorizontal } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import styles from "./ambient-music.module.css";

const TRACK_URL = "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100760";
const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
type PlaybackState = "idle" | "loading" | "playing" | "paused" | "error";

const STATUS_LABELS: Record<PlaybackState, string> = {
  idle: "Pronta para tocar",
  loading: "Carregando…",
  playing: "Tocando",
  paused: "Pausada",
  error: "Toque para tentar de novo",
};

export default function AmbientMusic() {
  const {t} = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>("idle");
  const [volume, setVolume] = useState(30);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const wantsPlaybackRef = useRef(false);
  const playAttemptRef = useRef(0);
  const mountedRef = useRef(false);
  const panelId = useId();
  const headingId = useId();
  const volumeId = useId();
  const volumeHintId = useId();
  const statusId = useId();
  const isActive = playback === "playing" || playback === "loading";
  const collapseLabel = t(isActive
    ? "Recolher controles; música continua"
    : "Recolher controles de música");

  useEffect(() => {
    mountedRef.current = true;
    const audio = audioRef.current;
    if (audio) audio.volume = 0.3;

    return () => {
      mountedRef.current = false;
      wantsPlaybackRef.current = false;
      playAttemptRef.current += 1;
      audio?.pause();
    };
  }, []);

  useEffect(() => {
    if (isOpen) collapseRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  function collapsePanel() {
    setIsOpen(false);
    settingsRef.current?.focus({ preventScroll: true });
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    // Cancel pending play requests as well as audible playback, without seeking.
    if (wantsPlaybackRef.current || !audio.paused) {
      wantsPlaybackRef.current = false;
      playAttemptRef.current += 1;
      audio.pause();
      setPlayback("paused");
      setErrorMessage(null);
      return;
    }

    const attempt = ++playAttemptRef.current;
    wantsPlaybackRef.current = true;
    setPlayback("loading");
    setErrorMessage(null);

    try {
      // Only a failed resource is reloaded. Ordinary pause/resume keeps its place.
      if (audio.error) audio.load();
      await audio.play();
      // A late promise must not resume audio after the listener cancelled it.
      if (!mountedRef.current || !wantsPlaybackRef.current) audio.pause();
    } catch (error) {
      if (!mountedRef.current || attempt !== playAttemptRef.current || !wantsPlaybackRef.current) return;
      wantsPlaybackRef.current = false;
      audio.pause();
      setPlayback("error");
      setErrorMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "O navegador não iniciou o áudio. Toque em reproduzir para tentar novamente."
          : "Não foi possível iniciar a música. Toque em reproduzir para tentar novamente.",
      );
    }
  }

  return (
    <div className={styles.widget} data-music-open={isOpen}>
      {/* This element stays mounted when the panel closes or the notebook changes. */}
      <audio
        ref={audioRef}
        src="/audio/organic-meditations-one.mp3"
        preload="none"
        loop
        onPlaying={(event) => {
          const audio = event.currentTarget;
          if (!wantsPlaybackRef.current) {
            audio.pause();
            return;
          }
          if (!audio.paused) {
            setPlayback("playing");
            setErrorMessage(null);
            setVolume(Math.round(audio.volume * 100));
          }
        }}
        onPause={(event) => {
          // A queued pause event may arrive after a newer play request.
          if (!event.currentTarget.paused || !mountedRef.current) return;
          wantsPlaybackRef.current = false;
          playAttemptRef.current += 1;
          setPlayback((current) => current === "error" ? current : "paused");
        }}
        onWaiting={(event) => {
          if (wantsPlaybackRef.current && !event.currentTarget.paused) setPlayback("loading");
        }}
        onLoadStart={() => {
          if (wantsPlaybackRef.current) setPlayback("loading");
        }}
        onEnded={() => {
          wantsPlaybackRef.current = false;
          playAttemptRef.current += 1;
          setPlayback("paused");
        }}
        onError={() => {
          wantsPlaybackRef.current = false;
          playAttemptRef.current += 1;
          audioRef.current?.pause();
          setPlayback("error");
          setErrorMessage("A música não carregou. Confira sua conexão e toque em reproduzir para tentar novamente.");
        }}
        onVolumeChange={(event) => setVolume(Math.round(event.currentTarget.volume * 100))}
      />

      {isOpen && (
        <section
          id={panelId}
          className={styles.panel}
          aria-labelledby={headingId}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              event.stopPropagation();
              collapsePanel();
            }
          }}
        >
          <header className={styles.header}>
            <h2 id={headingId} className={styles.heading}>
              <Music2 size={18} aria-hidden="true" />
              {t("Música para criar")}
            </h2>
            <button
              ref={collapseRef}
              type="button"
              className={styles.iconButton}
              aria-label={collapseLabel}
              onClick={collapsePanel}
            >
              <ChevronDown size={19} aria-hidden="true" />
            </button>
          </header>

          <div className={styles.content}>
            <a className={styles.trackLink} href={TRACK_URL} target="_blank" rel="noopener noreferrer">
              Organic Meditations One
              <ExternalLink size={13} aria-hidden="true" />
              <span className={styles.srOnly}> {t("(abre em outra aba)")}</span>
            </a>
            <p className={styles.creator}>Kevin MacLeod · incompetech.com</p>

            <div className={styles.volumeLabel}>
              <label htmlFor={volumeId}>{t("Volume")}</label>
              <output htmlFor={volumeId}>{volume}%</output>
            </div>
            <input
              id={volumeId}
              className={styles.volume}
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              aria-valuetext={`${volume}%`}
              aria-describedby={volumeHintId}
              onChange={(event) => {
                const audio = audioRef.current;
                if (!audio) return;
                audio.volume = Number(event.currentTarget.value) / 100;
                setVolume(Math.round(audio.volume * 100));
              }}
            />
            <p id={volumeHintId} className={styles.hint}>
              {t("Em alguns celulares, o volume é controlado pelo aparelho.")}
            </p>

            <p className={styles.license}>
              <a className={styles.link} href={LICENSE_URL} target="_blank" rel="noopener noreferrer">
                CC BY 4.0<span className={styles.srOnly}> {t("(abre em outra aba)")}</span>
              </a>
              <span>{t("Áudio original, sem alterações.")}</span>
            </p>
            <p className={styles.hint}>{t("Recolha os controles e continue no caderno.")}</p>
          </div>
        </section>
      )}

      {errorMessage && <p className={styles.error} role="alert">{t(errorMessage)}</p>}

      <div className={styles.pill} role="group" aria-label={t("Música ambiente")}>
        <button
          type="button"
          className={styles.playButton}
          aria-label={t(isActive ? "Pausar música" : "Reproduzir música")}
          aria-describedby={statusId}
          onClick={() => void togglePlayback()}
        >
          <span className={styles.playIcon} aria-hidden="true">
            {isActive ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
          </span>
          <span className={styles.buttonText}>
            <span className={styles.buttonTitle}>{t("Música")}</span>
            <span id={statusId} className={styles.status} aria-live="polite" aria-atomic="true">
              {t(STATUS_LABELS[playback])}
            </span>
          </span>
        </button>
        <button
          ref={settingsRef}
          type="button"
          className={styles.settingsButton}
          aria-label={isOpen ? collapseLabel : t("Abrir volume e informações da música")}
          aria-expanded={isOpen}
          aria-controls={isOpen ? panelId : undefined}
          onClick={() => isOpen ? collapsePanel() : setIsOpen(true)}
        >
          {isOpen ? <ChevronDown size={18} aria-hidden="true" /> : <SlidersHorizontal size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
