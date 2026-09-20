import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type P = {
  x: number;
  y: number;
  hx: number;
  hy: number;
  vx: number;
  vy: number;
  s: number;
  a: number;
  shift: boolean;
};

const COLORS = [
  "rgba(242,239,232,1)",
  "rgba(232,224,206,1)",
  "rgba(201,172,120,1)",
  "rgba(245,245,250,1)",
];

function toothSDF(x: number, y: number, cx: number, cy: number, scale: number): number {
  // Normalized coordinates around the tooth center.
  const nx = (x - cx) / scale;
  const ny = -(y - cy) / scale;

  // Crown bulge — an upper ellipse widening outward.
  const crown = Math.sqrt((nx * nx) / 0.2 + Math.pow(ny + 0.45, 2) / 0.16) - 1;

  // Root taper — two lower prongs spreading from the neck.
  const rootSpread = Math.abs(nx) * 1.7 - ny * 0.4;
  const root = Math.sqrt(Math.pow(Math.max(Math.abs(nx) - 0.06, 0), 2) / 0.035 + Math.pow(-ny - 0.1, 2) / 0.42) - 1;
  const rootMerge = Math.max(root, rootSpread - 0.55);

  // Neck constriction narrows the waist between crown and root.
  const waist = Math.abs(nx) - 0.2 + Math.max(0, -ny) * 0.35;

  return Math.max(Math.min(crown, rootMerge), waist);
}

export function MagneticTooth({ reduceMotion }: { reduceMotion?: boolean | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let width = 0;
    let height = 0;
    let particles: P[] = [];
    let raf = 0;
    let running = true;

    const mouse = { x: -9999, y: -9999, active: false };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      generate();
    }

    function generate() {
      // Tooth center is positioned to sit in the right-center of the hero,
      // where the portrait face used to be (object-position ~66% 44%).
      const scale = Math.min(width, height) * 0.34;
      const cx = width * 0.66;
      const cy = height * 0.44;

      const grid = Math.max(4, Math.floor(scale / 32));
      const density = reduceMotion ? 2 : 4;

      particles = [];
      for (let gy = -scale * 1.6; gy <= scale * 1.6; gy += grid) {
        for (let gx = -scale * 1.2; gx <= scale * 1.2; gx += grid) {
          const px = cx + gx;
          const py = cy + gy;
          const d = toothSDF(px, py, cx, cy, scale);
          if (d < 0) {
            const isChampagne = Math.random() < 0.14;
            for (let k = 0; k < density; k++) {
              const jx = (Math.random() - 0.5) * grid;
              const jy = (Math.random() - 0.5) * grid;
              particles.push({
                x: px + jx,
                y: py + jy,
                hx: px + jx,
                hy: py + jy,
                vx: 0,
                vy: 0,
                s: Math.random() * 1.4 + 0.8,
                a: Math.random() * 0.6 + 0.4,
                shift: isChampagne,
              });
            }
          }
        }
      }
    }

    function step() {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      const repelRadius = reduceMotion ? 0 : 130;
      const repelStrength = 0.55;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Magnetic repulsion from cursor.
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < repelRadius && dist > 0.001) {
            const force = (1 - dist / repelRadius) ** 2 * repelStrength;
            p.vx += (dx / dist) * force * 6;
            p.vy += (dy / dist) * force * 6;
          }
        }

        // Spring back to home position.
        const sx = (p.hx - p.x) * 0.05;
        const sy = (p.hy - p.y) * 0.05;
        p.vx += sx;
        p.vy += sy;

        // Damping.
        p.vx *= 0.86;
        p.vy *= 0.86;

        p.x += p.vx;
        p.y += p.vy;

        const color = p.shift ? COLORS[2] : COLORS[Math.floor((p.hx + p.hy) * 0.01) % 3 === 0 ? 1 : 0];
        ctx.globalAlpha = p.a;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(step);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    }
    function onMouseLeave() {
      mouse.active = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 0) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.touches[0].clientX - rect.left;
      mouse.y = e.touches[0].clientY - rect.top;
      mouse.active = true;
    }
    function onTouchEnd() {
      mouse.active = false;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    window.addEventListener("blur", onMouseLeave);

    resize();
    step();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("blur", onMouseLeave);
    };
  }, [reduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="hero-magnetic-canvas"
      aria-hidden="true"
    />
  );
}
