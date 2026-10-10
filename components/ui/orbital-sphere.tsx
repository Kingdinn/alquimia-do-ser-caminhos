"use client";

import { useEffect, useRef } from "react";
import {
  createOrbitalSphereRenderer,
  ORBITAL_SPHERE_DEFAULTS,
  type OrbitalSphereOptions,
  type OrbitalSphereRenderer,
} from "@/components/ui/orbital-sphere-utils/orbitalSphereRenderer";

export type OrbitalSphereBackgroundProps = Partial<OrbitalSphereOptions> & {
  className?: string;
  paused?: boolean;
};

/** Own React lifecycle for the app's particle sphere renderer. */
export function OrbitalSphereBackground({
  className = "",
  paused = false,
  hue = ORBITAL_SPHERE_DEFAULTS.hue,
  speed = ORBITAL_SPHERE_DEFAULTS.speed,
}: OrbitalSphereBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ hue, speed, paused });
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    latest.current = { hue, speed, paused };
    refreshRef.current();
  }, [hue, speed, paused]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let engine: OrbitalSphereRenderer | null = null;
    let inView = true;
    let lost = false;
    let closed = false;
    let frameId = 0;
    let elapsed = 0;
    let previous: number | undefined;
    let drawnAt: number | undefined;

    const cancel = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      previous = undefined;
      drawnAt = undefined;
    };
    const release = () => {
      cancel();
      engine?.dispose();
      engine = null;
      canvas.style.opacity = "0";
      host.dataset.renderer = "fallback";
    };
    const active = () => Boolean(engine && !closed && !lost && inView &&
      !document.hidden && !media.matches && !latest.current.paused);
    const paint = () => {
      if (!engine || lost || closed) return;
      try {
        engine.render(elapsed / 1000);
        canvas.style.opacity = "1";
        host.dataset.renderer = "ready";
      } catch {
        release();
      }
    };
    const animate = (now: number) => {
      frameId = 0;
      if (!active()) return;
      if (previous !== undefined) elapsed += Math.min(100, Math.max(0, now - previous));
      previous = now;
      if (drawnAt === undefined || now - drawnAt >= 1000 / 30) {
        paint();
        drawnAt = now;
      }
      if (active()) frameId = requestAnimationFrame(animate);
    };
    const refresh = () => {
      if (active()) {
        if (!frameId) frameId = requestAnimationFrame(animate);
      } else {
        cancel();
        if (inView && !document.hidden) paint();
      }
    };
    refreshRef.current = refresh;
    const resize = () => {
      if (!engine || lost || closed) return;
      try {
        const { width, height } = host.getBoundingClientRect();
        engine.resize(width, height);
        if (inView && !document.hidden) paint();
      } catch {
        release();
      }
    };
    const start = () => {
      try {
        engine = createOrbitalSphereRenderer(canvas, () => ({
          hue: latest.current.hue,
          speed: latest.current.speed,
        }));
        resize();
      } catch {
        release();
      }
      refresh();
    };
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      release();
    };
    const onRestored = () => {
      if (closed) return;
      lost = false;
      start();
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    document.addEventListener("visibilitychange", refresh);
    media.addEventListener("change", refresh);
    window.addEventListener("resize", resize, { passive: true });
    const sizeObserver = new ResizeObserver(resize);
    const viewObserver = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? true;
      refresh();
    });
    sizeObserver.observe(host);
    viewObserver.observe(host);
    start();

    return () => {
      closed = true;
      refreshRef.current = () => {};
      sizeObserver.disconnect();
      viewObserver.disconnect();
      window.removeEventListener("resize", resize);
      media.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      release();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`threeui-background orbital-sphere ${className}`}
      data-renderer="fallback"
      style={{ pointerEvents: "none" }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", opacity: 0, filter: `hue-rotate(${hue}deg)` }}
      />
    </div>
  );
}

export default OrbitalSphereBackground;
