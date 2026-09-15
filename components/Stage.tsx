"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const MAX_SCALE = 3;

export default function Stage({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const availW = window.innerWidth;
        const availH = window.innerHeight;
        const natW = inner.offsetWidth;
        const natH = inner.offsetHeight;
        if (!natW || !natH || !availW || !availH) return;
        const next = Math.min(availW / natW, availH / natH, MAX_SCALE);
        setScale(next > 0 ? next : 1);
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(inner);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return (
    <div
      ref={outerRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
