import React, { useEffect, useRef } from 'react';

interface Fish {
  x: number;
  y: number;
  speed: number;
  length: number;
  baseY: number;
  phase: number;
  color: string;
}

interface Shark {
  x: number;
  y: number;
  speed: number;
  scale: number;
  direction: number; // 1: derecha, -1: izquierda
  tailPhase: number;
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobbleSpeed: number;
  wobbleRange: number;
  seed: number;
}

interface KelpBlade {
  baseX: number;
  height: number;
  segments: number;
  amplitude: number;
  phaseOffset: number;
  color: string;
}

export const OceanDynamicCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse / Touch interaction coordinates with gentle dampening
    const pointer = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    };

    // 1. Inicialización de Algas (Kelp Forest)
    let kelpForest: KelpBlade[] = [];
    const initKelp = () => {
      kelpForest = [];
      const count = Math.floor(width / 35);
      const colors = ['#022f2b', '#03443e', '#012622', '#04554d'];
      for (let i = 0; i < count; i++) {
        kelpForest.push({
          baseX: i * 35 + (Math.random() * 20 - 10),
          height: height * 0.28 + Math.random() * (height * 0.22),
          segments: 8,
          amplitude: 15 + Math.random() * 20,
          phaseOffset: Math.random() * Math.PI * 2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };
    initKelp();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initKelp();
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let cx = 0;
      let cy = 0;
      if ('touches' in e && e.touches.length > 0) {
        cx = e.touches[0].clientX;
        cy = e.touches[0].clientY;
      } else if ('clientX' in e) {
        cx = e.clientX;
        cy = e.clientY;
      }
      pointer.targetX = cx;
      pointer.targetY = cy;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
      pointer.targetX = -1000;
      pointer.targetY = -1000;
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', handlePointerLeave);

    // 2. Cardumen de Peces
    const fishes: Fish[] = Array.from({ length: 24 }, () => {
      const startX = Math.random() * width;
      const startY = height * 0.22 + Math.random() * (height * 0.52);
      return {
        x: startX,
        y: startY,
        baseY: startY,
        speed: 1.2 + Math.random() * 1.6,
        length: 12 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.3 ? '#00fac8' : '#38bdf8',
      };
    });

    // 3. Tiburón de Profundidad (Predador Oceánico)
    const shark: Shark = {
      x: -250,
      y: height * 0.38,
      speed: 1.1,
      scale: 1.25,
      direction: 1,
      tailPhase: 0,
    };

    // 4. Micro-burbujas Bioluminiscentes
    const bubbles: Bubble[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.8 + Math.random() * 2.2,
      speed: 0.6 + Math.random() * 1.4,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      wobbleRange: 1 + Math.random() * 2,
      seed: Math.random() * 100,
    }));

    let time = 0;

    // Renderizador vectorial principal
    const render = () => {
      time += 0.02;

      // Pointer smooth interpolation
      pointer.x += (pointer.targetX - pointer.x) * 0.1;
      pointer.y += (pointer.targetY - pointer.y) * 0.1;

      ctx.clearRect(0, 0, width, height);

      // --- CAPA 0: Gradiente de Agua Profunda ---
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#021827');
      bgGrad.addColorStop(0.5, '#01121e');
      bgGrad.addColorStop(1, '#00070c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // --- CAPA 1: Rayos Volumétricos de Luz Cenital (Cáusticas) ---
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const xOffset = width * (0.2 + i * 0.22) + Math.sin(time * 0.6 + i) * 60;
        const beamGrad = ctx.createRadialGradient(xOffset, 0, 10, xOffset, height * 0.7, width * 0.3);
        beamGrad.addColorStop(0, 'rgba(0, 250, 200, 0.07)');
        beamGrad.addColorStop(0.6, 'rgba(0, 180, 216, 0.025)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(xOffset - 40, 0);
        ctx.lineTo(xOffset + 40, 0);
        ctx.lineTo(xOffset + 180, height);
        ctx.lineTo(xOffset - 120, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // --- CAPA 2: Tiburón en Profundidad (Silueta Hidrodinámica) ---
      shark.x += shark.speed * shark.direction;
      shark.tailPhase += 0.08;

      if (shark.direction === 1 && shark.x > width + 320) {
        shark.direction = -1;
        shark.y = height * 0.2 + Math.random() * (height * 0.45);
      } else if (shark.direction === -1 && shark.x < -320) {
        shark.direction = 1;
        shark.y = height * 0.2 + Math.random() * (height * 0.45);
      }

      ctx.save();
      ctx.translate(shark.x, shark.y);
      if (shark.direction === -1) {
        ctx.scale(-shark.scale, shark.scale);
      } else {
        ctx.scale(shark.scale, shark.scale);
      }

      // Estilo de silueta distante con bioluminiscencia sutil
      ctx.fillStyle = 'rgba(2, 38, 56, 0.58)';
      ctx.strokeStyle = 'rgba(0, 250, 200, 0.18)';
      ctx.lineWidth = 1.5;

      const tailWiggle = Math.sin(shark.tailPhase) * 6;

      ctx.beginPath();
      // Morro y cabeza
      ctx.moveTo(90, 0);
      // Espalda y aleta dorsal
      ctx.quadraticCurveTo(40, -18, 15, -16);
      ctx.lineTo(5, -45); // Extremo aleta dorsal
      ctx.quadraticCurveTo(0, -20, -25, -10);
      // Hacia el pedúnculo caudal
      ctx.lineTo(-75, -4);
      // Aleta caudal (cola oscilante)
      ctx.lineTo(-105 + tailWiggle, -28);
      ctx.quadraticCurveTo(-90 + tailWiggle, 0, -110 + tailWiggle, 24);
      ctx.lineTo(-75, 4);
      // Vientre y aleta pectoral
      ctx.quadraticCurveTo(-30, 10, 10, 12);
      ctx.lineTo(30, 32); // Aleta pectoral
      ctx.quadraticCurveTo(36, 16, 50, 6);
      ctx.quadraticCurveTo(75, 5, 90, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // --- CAPA 3: Cardumen de Peces con Nado Orgánico ---
      fishes.forEach((fish) => {
        fish.x += fish.speed;
        fish.phase += 0.12;

        // Interactive fluid perturbation: fish gently scatter away from user touch/pointer
        let targetY = fish.baseY + Math.sin(fish.phase) * 6;
        if (pointer.active) {
          const dx = fish.x - pointer.x;
          const dy = fish.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && dist > 1) {
            const push = (1 - dist / 120) * 4;
            fish.x += (dx / dist) * push;
            targetY += (dy / dist) * push;
          }
        }

        fish.y += (targetY - fish.y) * 0.1;

        if (fish.x > width + 50) {
          fish.x = -50;
          fish.baseY = height * 0.2 + Math.random() * (height * 0.55);
          fish.speed = 1.2 + Math.random() * 1.6;
        }

        ctx.save();
        ctx.translate(fish.x, fish.y);
        ctx.fillStyle = fish.color;
        ctx.shadowColor = fish.color;
        ctx.shadowBlur = 8;

        const tailAngle = Math.sin(fish.phase) * 5;

        // Cuerpo hidrodinámico
        ctx.beginPath();
        ctx.ellipse(0, 0, fish.length, fish.length * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Aleta caudal articulada
        ctx.beginPath();
        ctx.moveTo(-fish.length * 0.8, 0);
        ctx.lineTo(-fish.length * 1.4, -fish.length * 0.45 + tailAngle);
        ctx.lineTo(-fish.length * 1.4, fish.length * 0.45 + tailAngle);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });

      // --- CAPA 4: Algas Marinas en Primer Plano Inferior ---
      kelpForest.forEach((blade) => {
        ctx.save();
        ctx.strokeStyle = blade.color;
        ctx.fillStyle = blade.color;
        ctx.lineWidth = 14;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0, 250, 200, 0.08)';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(blade.baseX, height);

        const segLen = blade.height / blade.segments;
        let prevX = blade.baseX;
        let prevY = height;

        for (let s = 1; s <= blade.segments; s++) {
          const currentY = height - s * segLen;
          const sway = Math.sin(time + blade.phaseOffset + s * 0.4) * (blade.amplitude * (s / blade.segments));
          const currentX = blade.baseX + sway;
          const midX = (prevX + currentX) / 2;
          const midY = (prevY + currentY) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
          prevX = currentX;
          prevY = currentY;
        }
        ctx.lineTo(prevX, prevY);
        ctx.stroke();

        // Hojas secundarias
        for (let l = 2; l < blade.segments; l += 2) {
          const leafY = height - l * segLen;
          const leafSway = Math.sin(time + blade.phaseOffset + l * 0.4) * (blade.amplitude * (l / blade.segments));
          const leafX = blade.baseX + leafSway;
          const side = l % 4 === 0 ? 1 : -1;

          ctx.beginPath();
          ctx.ellipse(
            leafX + side * 14,
            leafY,
            16,
            6,
            side * 0.4 + Math.sin(time + l) * 0.2,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.restore();
      });

      // --- CAPA 5: Micro-burbujas Bioluminiscentes ---
      ctx.save();
      ctx.fillStyle = 'rgba(165, 243, 252, 0.65)';
      ctx.shadowColor = 'rgba(0, 250, 200, 0.8)';
      ctx.shadowBlur = 6;

      bubbles.forEach((b) => {
        b.y -= b.speed;
        b.seed += b.wobbleSpeed;
        let currentX = b.x + Math.sin(b.seed) * b.wobbleRange;

        // Interactive gentle bubble displacement
        if (pointer.active) {
          const dx = currentX - pointer.x;
          const dy = b.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90 && dist > 1) {
            const force = (1 - dist / 90) * 2;
            b.x += (dx / dist) * force;
            b.y += (dy / dist) * force;
          }
        }

        if (b.y < -10) {
          b.y = height + 10;
          b.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.arc(currentX, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    // Pausar animación si la pestaña no está visible (ahorro crítico de batería y ciclos de audio)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10 w-full h-full"
    />
  );
};
