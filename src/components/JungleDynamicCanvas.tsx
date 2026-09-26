import React, { useEffect, useRef } from 'react';

interface Firefly {
  x: number;
  y: number;
  radius: number;
  phase: number;
  phaseSpeed: number;
  vx: number;
  vy: number;
  color: string;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

interface Bird {
  x: number;
  y: number;
  speedX: number;
  scale: number;
  wingAngle: number;
  wingSpeed: number;
}

interface Vine {
  baseX: number;
  length: number;
  amplitude: number;
  phaseOffset: number;
  segments: number;
  color: string;
}

export const JungleDynamicCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Pointer coordinates with gentle dampening
    const pointer = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    };

    // 1. Lianas colgantes de la bóveda arbórea
    let vines: Vine[] = [];
    const initVines = () => {
      vines = [];
      const vineCount = Math.floor(width / 50);
      const vineColors = ['#062e12', '#0a421b', '#041f0c', '#083315'];
      for (let i = 0; i < vineCount; i++) {
        vines.push({
          baseX: i * 50 + (Math.random() * 30 - 15),
          length: height * 0.25 + Math.random() * (height * 0.35),
          amplitude: 8 + Math.random() * 14,
          phaseOffset: Math.random() * Math.PI * 2,
          segments: 7,
          color: vineColors[Math.floor(Math.random() * vineColors.length)],
        });
      }
    };
    initVines();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initVines();
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

    // 2. Luciérnagas bioluminiscentes (vuelo errático suave)
    const fireflies: Firefly[] = Array.from({ length: 34 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 1.2,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.03 + Math.random() * 0.04,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      color: Math.random() > 0.3 ? '#4ade80' : '#a3e635',
    }));

    // 3. Microgotas de lluvia tropical (garúa / neblina cálida)
    const rainDrops: RainDrop[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: Math.random() * 12 + 6,
      speed: Math.random() * 5 + 6,
    }));

    // 4. Guacamayos / Aves amazónicas
    const birds: Bird[] = [
      { x: -50, y: height * 0.25, speedX: 1.8, scale: 0.8, wingAngle: 0, wingSpeed: 0.09 },
      { x: -140, y: height * 0.29, speedX: 1.7, scale: 0.65, wingAngle: 0.8, wingSpeed: 0.1 },
    ];

    let time = 0;

    const render = () => {
      time += 0.02;

      // Pointer smooth interpolation
      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // --- CAPA 0: Gradiente de Fondo (Jungla Nocturna) ---
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#020d06');   // Dosel oscuro superior
      bgGrad.addColorStop(0.5, '#041c0e'); // Sombra intermedia
      bgGrad.addColorStop(1, '#010804');   // Piso selvático húmedo
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // --- CAPA 1: Neblina de Evapotranspiración ---
      ctx.save();
      const mistGrad = ctx.createRadialGradient(
        width * 0.5, height * 0.7, 50,
        width * 0.5, height * 0.7, width * 0.75
      );
      mistGrad.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
      mistGrad.addColorStop(0.6, 'rgba(16, 185, 129, 0.03)');
      mistGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // --- CAPA 2: Lianas Colgantes del Dosel Superior ---
      vines.forEach((v) => {
        ctx.save();
        ctx.strokeStyle = v.color;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(v.baseX, 0);

        const segLen = v.length / v.segments;
        let prevX = v.baseX;
        let prevY = 0;

        for (let s = 1; s <= v.segments; s++) {
          const currentY = s * segLen;
          const sway = Math.sin(time + v.phaseOffset + s * 0.3) * (v.amplitude * (s / v.segments));
          const currentX = v.baseX + sway;
          const midX = (prevX + currentX) / 2;
          const midY = (prevY + currentY) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
          prevX = currentX;
          prevY = currentY;
        }
        ctx.lineTo(prevX, prevY);
        ctx.stroke();

        // Hojas parásitas incrustadas en las lianas
        for (let l = 2; l < v.segments; l += 2) {
          const leafY = l * segLen;
          const leafSway = Math.sin(time + v.phaseOffset + l * 0.3) * (v.amplitude * (l / v.segments));
          const leafX = v.baseX + leafSway;
          const side = l % 4 === 0 ? 1 : -1;

          ctx.fillStyle = '#0f5123';
          ctx.beginPath();
          ctx.ellipse(
            leafX + side * 9,
            leafY,
            11,
            4.5,
            side * 0.5 + Math.sin(time + l) * 0.15,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
        ctx.restore();
      });

      // --- CAPA 3: Aves Tropicales en Formación ---
      birds.forEach((b) => {
        b.x += b.speedX;
        b.wingAngle += b.wingSpeed;
        if (b.x > width + 80) {
          b.x = -80;
          b.y = height * 0.15 + Math.random() * (height * 0.25);
        }

        ctx.save();
        ctx.translate(b.x, b.y + Math.sin(b.x * 0.01) * 6);
        ctx.scale(b.scale, b.scale);

        ctx.fillStyle = '#062610';
        ctx.strokeStyle = '#062610';
        ctx.lineWidth = 2;

        // Cuerpo estilizado
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cola larga de guacamayo
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(-24, 2);
        ctx.stroke();

        // Alas articuladas
        const wingOffset = Math.sin(b.wingAngle) * 7;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-4, -6 + wingOffset, -16, -4 + wingOffset);
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(4, -6 + wingOffset, 16, -4 + wingOffset);
        ctx.stroke();

        ctx.restore();
      });

      // --- CAPA 4: Follaje Inferior Masivo (Hojas Gigantes / Helechos) ---
      const drawForegroundLeaf = (x: number, y: number, scaleX: number, scaleY: number, rot: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot + Math.sin(time + x) * 0.04);
        ctx.scale(scaleX, scaleY);
        ctx.fillStyle = '#03170a';
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-60, -80, -110, -160, 0, -240);
        ctx.bezierCurveTo(110, -160, 60, -80, 0, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Nervadura central
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -220);
        ctx.stroke();
        ctx.restore();
      };

      // Follaje de esquina inferior izquierda
      drawForegroundLeaf(width * 0.08, height + 20, 0.7, 0.7, 0.25);
      drawForegroundLeaf(-20, height + 10, 0.85, 0.85, 0.45);

      // Follaje de esquina inferior derecha
      drawForegroundLeaf(width * 0.92, height + 20, -0.7, 0.7, -0.25);
      drawForegroundLeaf(width + 20, height + 10, -0.85, 0.85, -0.45);

      // --- CAPA 5: Luciérnagas Bioluminiscentes (Luces Orgánicas) ---
      fireflies.forEach((f) => {
        f.x += f.vx + (Math.random() - 0.5) * 0.3;
        f.y += f.vy + (Math.random() - 0.5) * 0.3;
        f.phase += f.phaseSpeed;

        // Gentle swarm attraction to pointer
        if (pointer.active) {
          const dx = pointer.x - f.x;
          const dy = pointer.y - f.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140 && dist > 1) {
            f.x += (dx / dist) * 0.8;
            f.y += (dy / dist) * 0.8;
          }
        }

        if (f.x < 0) f.x = width;
        if (f.x > width) f.x = 0;
        if (f.y < 0) f.y = height;
        if (f.y > height) f.y = 0;

        const pulse = (Math.sin(f.phase) + 1) * 0.5; // Normalizado 0..1
        if (pulse < 0.08) return; // Parpadeo apagado

        ctx.save();
        // Halo exterior
        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 7);
        glow.addColorStop(0, f.color === '#4ade80' ? 'rgba(74, 222, 128, 0.55)' : 'rgba(163, 230, 53, 0.55)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * 7, 0, Math.PI * 2);
        ctx.fill();

        // Núcleo brillante
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // --- CAPA 6: Garúa / Lluvia Tropical Rasante ---
      ctx.save();
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      rainDrops.forEach((d) => {
        d.y += d.speed;
        d.x += 1.2; // Deriva por viento
        if (d.y > height) {
          d.y = -15;
          d.x = Math.random() * width;
        }
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 3, d.y + d.len);
      });
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    // Pausar animación cuando la pestaña pasa a segundo plano
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(render);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibility);
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
