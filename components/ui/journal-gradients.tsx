"use client";

import { useEffect, useRef, type CSSProperties } from "react";

type BackgroundProps = { className?: string; paused?: boolean };
type FrameBuilder = (elapsedSeconds: number) => string;

export const BLOOM_FIELD_SEED = 174074637;

// The supplied SVG texture stays identical throughout the animation.
function grain(opacity: string) {
  return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='${opacity}'/></svg>")`;
}

const BLOOM_GRAIN = grain("0.500");
const ECHO_GRAIN = grain("0.210");
const BLOOM_BLOBS = [
  { x: 67.04, y: 45.93, rgb: "226, 226, 226", stops: [0, 19.02, 38.05, 57.07, 76.1] },
  { x: 35.47, y: 65.92, rgb: "27, 159, 254", stops: [0, 12.9, 25.8, 38.7, 51.6] },
  { x: 48.33, y: 20.11, rgb: "27, 159, 254", stops: [0, 16.75, 33.5, 50.25, 67] },
  { x: 80.81, y: 88.03, rgb: "74, 201, 255", stops: [0, 10.28, 20.55, 30.83, 41.1] },
] as const;
const BLOOM_ALPHA = [1, 0.844, 0.5, 0.156, 0] as const;

// Fixed seeded phases are generated once, never once per frame.
function phasesFromSeed(seed: number) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  return BLOOM_BLOBS.map(() => ({ x: next() * Math.PI * 2, y: next() * Math.PI * 2 }));
}
const BLOOM_PHASES = phasesFromSeed(BLOOM_FIELD_SEED);

function validTime(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

export function getBloomFieldCenters(elapsedSeconds = 0) {
  const ph = validTime(elapsedSeconds);
  return BLOOM_BLOBS.map((blob, index) => {
    const phase = BLOOM_PHASES[index];
    return {
      x: blob.x + (Math.sin(ph * 0.55 + phase.x) - Math.sin(phase.x)) * 14,
      y: blob.y + (Math.sin(ph * 0.43 + phase.y) - Math.sin(phase.y)) * 14,
    };
  });
}

export function getBloomFieldBackground(elapsedSeconds = 0) {
  const centers = getBloomFieldCenters(elapsedSeconds);
  return [BLOOM_GRAIN, ...BLOOM_BLOBS.map((blob, index) => {
    const stops = blob.stops.map((stop, stopIndex) => `rgba(${blob.rgb}, ${BLOOM_ALPHA[stopIndex]}) ${stop}%`).join(", ");
    return `radial-gradient(circle at ${centers[index].x}% ${centers[index].y}%, ${stops})`;
  })].join(", ");
}

const ECHO_STOPS = [
  { color: "#ffffff", position: 0 },
  { color: "#ffffff", position: 14.67 },
  { color: "#aed4fb", position: 18.67 },
  { color: "#aed4fb", position: 31.33 },
  { color: "#71a8fa", position: 35.33 },
  { color: "#71a8fa", position: 48 },
  { color: "#5d77fe", position: 52 },
  { color: "#5d77fe", position: 64.67 },
  { color: "#5251fd", position: 68.67 },
  { color: "#5251fd", position: 81.33 },
  { color: "#4d2ff9", position: 85.33 },
  { color: "#4d2ff9", position: 100 },
] as const;

export function getEchoRingsStops(elapsedSeconds = 0) {
  const t = validTime(elapsedSeconds);
  const ripple = (1 - Math.cos(t * 0.9)) * 0.5 * 0.30;
  const outwardShift = ripple * (100 / 6);
  // Interior edges move together; the authored soft transitions keep their width.
  // Fixed endpoints prevent wrapping and always cover the outermost area.
  return ECHO_STOPS.map((stop, index) => ({
    color: stop.color,
    position: index === 0 || index === ECHO_STOPS.length - 1 ? stop.position : stop.position + outwardShift,
  }));
}

export function getEchoRingsCenter(elapsedSeconds = 0) {
  const phase = validTime(elapsedSeconds) * 0.23;
  return { x: 50 + Math.sin(phase) * 1.5, y: 50 + (Math.cos(phase) - 1) * 1.5 };
}

export function getEchoRingsBackground(elapsedSeconds = 0) {
  const center = getEchoRingsCenter(elapsedSeconds);
  const stops = getEchoRingsStops(elapsedSeconds).map(stop => `${stop.color} ${stop.position}%`).join(", ");
  return `${ECHO_GRAIN}, radial-gradient(circle at ${center.x}% ${center.y}%, ${stops})`;
}

function useAnimatedBackground(frame: FrameBuilder, paused: boolean) {
  const element = useRef<HTMLDivElement>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let requestId: number | null = null;
    let previousTimestamp: number | null = null;
    let disposed = false;
    let inViewport = typeof window.IntersectionObserver !== "function";

    function cancel() {
      if (requestId !== null) window.cancelAnimationFrame(requestId);
      requestId = null;
      previousTimestamp = null;
    }
    function canAnimate() {
      return !disposed && !paused && inViewport && !reducedMotion.matches && !document.hidden;
    }
    function paint(seconds: number) {
      if (element.current) element.current.style.backgroundImage = frame(seconds);
    }
    function tick(timestamp: number) {
      requestId = null;
      if (!canAnimate()) {
        previousTimestamp = null;
        return;
      }
      if (previousTimestamp !== null) elapsed.current += (timestamp - previousTimestamp) / 1000;
      previousTimestamp = timestamp;
      paint(elapsed.current);
      requestId = window.requestAnimationFrame(tick);
    }
    function synchronize() {
      cancel();
      paint(reducedMotion.matches ? 0 : elapsed.current);
      if (canAnimate()) requestId = window.requestAnimationFrame(tick);
    }

    const observedElement = element.current;
    const visibilityThreshold = 0.001;
    const observer = typeof window.IntersectionObserver === "function"
      ? new window.IntersectionObserver(entries => {
        if (disposed) return;
        const entry = entries.find(item => item.target === observedElement);
        if (!entry) return;
        const visible = entry.isIntersecting && entry.intersectionRatio >= visibilityThreshold;
        if (visible !== inViewport) {
          inViewport = visible;
          synchronize();
        }
      }, { threshold: visibilityThreshold })
      : null;

    if (observedElement) observer?.observe(observedElement);
    reducedMotion.addEventListener("change", synchronize);
    document.addEventListener("visibilitychange", synchronize);
    synchronize();
    return () => {
      disposed = true;
      cancel();
      observer?.disconnect();
      reducedMotion.removeEventListener("change", synchronize);
      document.removeEventListener("visibilitychange", synchronize);
    };
  }, [frame, paused]);

  return element;
}

const BASE_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};
const BLOOM_STYLE: CSSProperties = {
  ...BASE_STYLE,
  backgroundColor: "#E2E2E2",
  backgroundImage: getBloomFieldBackground(0),
  backgroundSize: "120px 120px, auto, auto, auto, auto",
  backgroundBlendMode: "overlay, normal, normal, normal, normal",
};
const ECHO_STYLE: CSSProperties = {
  ...BASE_STYLE,
  backgroundColor: "#FFFFFF",
  backgroundImage: getEchoRingsBackground(0),
  backgroundSize: "120px 120px, auto",
  backgroundBlendMode: "overlay, normal",
};

export function BloomFieldBackground({ className, paused = false }: BackgroundProps) {
  const ref = useAnimatedBackground(getBloomFieldBackground, paused);
  return <div ref={ref} aria-hidden="true" className={className} style={BLOOM_STYLE} />;
}

export function EchoRingsBackground({ className, paused = false }: BackgroundProps) {
  const ref = useAnimatedBackground(getEchoRingsBackground, paused);
  return <div ref={ref} aria-hidden="true" className={className} style={ECHO_STYLE} />;
}
