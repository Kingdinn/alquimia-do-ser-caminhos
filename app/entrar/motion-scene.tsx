"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = { children: ReactNode; className: string; labelledBy: string };

export default function MotionScene({ children, className, labelledBy }: Props) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  return <section className={className} aria-labelledby={labelledBy} data-motion-paused={reducedMotion}>
    {children}
  </section>;
}
