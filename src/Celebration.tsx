// Lightweight Base-blue confetti. A single full-screen canvas drives every
// burst (milestone pops and the big 4096 finale) via an imperative `fire`
// handle, so there is at most one rAF loop and it idles when no particles
// remain — cheap and mobile-friendly.
//
// The entire rAF engine lives inside one effect; `fire` is published through a
// ref and surfaced via useImperativeHandle. Keeping the loop local to the
// effect avoids both the "ref during render" and self-referencing-callback
// lint pitfalls while still giving callers a stable imperative handle.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type CelebrationHandle = {
  /** intensity scales particle count; originY is 0 (top) .. 1 (bottom). */
  fire: (intensity?: number, originY?: number) => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  color: string;
  life: number;
  maxLife: number;
};

// Base-blue palette with white/light-blue sparkles.
const COLORS = ["#0052FF", "#3b7bff", "#7aa6ff", "#b9d2ff", "#ffffff", "#e8f0ff"];
const GRAVITY = 0.16;
const DRAG = 0.992;

export const Celebration = forwardRef<CelebrationHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Published by the effect once the canvas/engine is wired up. No-op until then.
  const fireRef = useRef<CelebrationHandle["fire"]>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles: Particle[] = [];
    let rafId = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    function loop() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        p.life -= 1;

        if (p.life <= 0 || p.y > h + 40) {
          particles.splice(i, 1);
          continue;
        }

        ctx!.save();
        ctx!.globalAlpha = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.5)));
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx!.restore();
      }

      if (particles.length > 0) {
        rafId = requestAnimationFrame(loop);
      } else {
        ctx!.clearRect(0, 0, w, h);
        running = false;
      }
    }

    fireRef.current = (intensity = 1, originY = 0.42) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const count = Math.round(70 * intensity);
      const ox = w / 2;
      const oy = h * originY;
      const power = 7 + 4 * intensity;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = power * (0.45 + Math.random() * 0.85);
        particles.push({
          x: ox + (Math.random() - 0.5) * 60,
          y: oy + (Math.random() - 0.5) * 30,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - power * 0.5,
          size: 6 + Math.random() * 8,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 90 + Math.random() * 50,
          maxLife: 140,
        });
      }
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      }
    };

    return () => {
      window.removeEventListener("resize", resize);
      if (rafId) cancelAnimationFrame(rafId);
      running = false;
      fireRef.current = () => {};
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      fire: (intensity, originY) => fireRef.current(intensity, originY),
    }),
    []
  );

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
});

Celebration.displayName = "Celebration";
