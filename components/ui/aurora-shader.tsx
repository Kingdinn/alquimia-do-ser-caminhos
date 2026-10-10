"use client";

import { useEffect, useRef } from "react";
import {
  createAuroraRenderer,
  type AuroraPointer,
  type AuroraRenderer,
} from "./aurora-shader-utils/auroraRenderer";

export type AuroraShaderBackgroundProps = {
  className?: string;
  paused?: boolean;
};

export default function AuroraShaderBackground({
  className = "",
  paused = false,
}: AuroraShaderBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const syncMotionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    syncMotionRef.current?.();
  }, [paused]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const pointerSurface =
      host.closest<HTMLElement>("[data-aurora-surface]") ?? host.parentElement ?? host;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer: AuroraPointer = { x: 0, y: 0, presence: 0 };
    let renderer: AuroraRenderer | null = null;
    let visible = true;
    let contextLost = false;
    let disposed = false;
    let frame = 0;
    let elapsed = 0;
    let lastTick: number | null = null;
    let lastDraw: number | null = null;
    const frameInterval = 1000 / 30;

    const shouldAnimate = () =>
      !disposed && !!renderer && !contextLost && visible && !document.hidden &&
      !pausedRef.current && !reducedMotion.matches;

    const draw = () => {
      if (!renderer || contextLost || disposed) return;
      try {
        renderer.render(elapsed / 1000, pointer);
        canvas.style.opacity = "1";
      } catch {
        stop();
        renderer.dispose();
        renderer = null;
        canvas.style.opacity = "0";
      }
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTick = null;
      lastDraw = null;
    };

    const tick = (timestamp: number) => {
      frame = 0;
      if (!shouldAnimate()) {
        stop();
        return;
      }
      if (lastTick !== null) elapsed += Math.min(100, Math.max(0, timestamp - lastTick));
      lastTick = timestamp;
      if (lastDraw === null || timestamp - lastDraw >= frameInterval) {
        draw();
        lastDraw = lastDraw === null
          ? timestamp
          : timestamp - ((timestamp - lastDraw) % frameInterval);
      }
      if (shouldAnimate()) frame = requestAnimationFrame(tick);
    };

    const syncMotion = () => {
      if (shouldAnimate()) {
        if (!frame) frame = requestAnimationFrame(tick);
      } else {
        stop();
        if (pausedRef.current || reducedMotion.matches) pointer.presence = 0;
        // One still frame removes cursor distortion when motion is disabled.
        if (visible && !document.hidden) draw();
      }
    };
    syncMotionRef.current = syncMotion;

    const resize = () => {
      if (!renderer || contextLost || disposed) return;
      const bounds = host.getBoundingClientRect();
      renderer.resize(bounds.width, bounds.height);
      if (visible && !document.hidden) draw();
    };

    const initialize = () => {
      try {
        renderer = createAuroraRenderer(canvas);
        resize();
      } catch {
        renderer?.dispose();
        renderer = null;
        canvas.style.opacity = "0";
      }
      syncMotion();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!shouldAnimate() || event.pointerType === "touch") return;
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        pointer.presence = 0;
        return;
      }
      pointer.x = x * 2 - 1;
      pointer.y = 1 - y * 2;
      pointer.presence = 1;
    };
    const clearPointer = () => { pointer.presence = 0; };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      canvas.style.opacity = "0";
      stop();
      renderer?.dispose();
      renderer = null;
    };
    const onContextRestored = () => {
      if (disposed) return;
      contextLost = false;
      initialize();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    pointerSurface.addEventListener("pointermove", onPointerMove, { passive: true });
    pointerSurface.addEventListener("pointerleave", clearPointer, { passive: true });
    pointerSurface.addEventListener("pointercancel", clearPointer, { passive: true });
    document.addEventListener("visibilitychange", syncMotion);
    reducedMotion.addEventListener("change", syncMotion);
    window.addEventListener("resize", resize, { passive: true });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      syncMotion();
    });
    intersection.observe(host);
    initialize();

    return () => {
      disposed = true;
      stop();
      syncMotionRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      pointerSurface.removeEventListener("pointermove", onPointerMove);
      pointerSurface.removeEventListener("pointerleave", clearPointer);
      pointerSurface.removeEventListener("pointercancel", clearPointer);
      document.removeEventListener("visibilitychange", syncMotion);
      reducedMotion.removeEventListener("change", syncMotion);
      window.removeEventListener("resize", resize);
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`aurora-shader-background${className ? ` ${className}` : ""}`}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        background: "radial-gradient(ellipse at 34% 24%, #d4c9b4 0%, #739d8f 42%, #22202e 100%)",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", opacity: 0 }}
      />
    </div>
  );
}
