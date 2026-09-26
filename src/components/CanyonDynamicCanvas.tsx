import React, { useEffect, useRef } from 'react';

interface Eagle {
  x: number;
  y: number;
  scale: number;
  speedX: number;
  wingAngle: number;
  wingSpeed: number;
}

interface DustMote {
  x: number;
  y: number;
  size: number;
  speedX: number;
  alpha: number;
}

export const CanyonDynamicCanvas: React.FC = () => {
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

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
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

    // 1. Águilas en vuelo térmico circular
    const eagles: Eagle[] = [
      { x: width * 0.25, y: height * 0.32, scale: 0.9, speedX: 0.45, wingAngle: 0, wingSpeed: 0.04 },
      { x: width * 0.65, y: height * 0.22, scale: 0.6, speedX: 0.3, wingAngle: 1.5, wingSpeed: 0.05 },
    ];

    // 2. Partículas de polvo del desierto y calima
    const dustParticles: DustMote[] = Array.from({ length: 45 }, () => ({
      x: Math.random() * width,
      y: height * 0.35 + Math.random() * (height * 0.65),
      size: Math.random() * 1.8 + 0.6,
      speedX: Math.random() * 0.45 + 0.2,
      alpha: Math.random() * 0.5 + 0.2,
    }));

    let time = 0;

    const render = () => {
      time += 0.015;

      // Pointer smooth interpolation
      pointer.x += (pointer.targetX - pointer.x) * 0.08;
      pointer.y += (pointer.targetY - pointer.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // --- CAPA 0: Bóveda Celeste en Atardecer Rasante ---
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height * 0.75);
      skyGrad.addColorStop(0, '#1a0808');   // Morado oscuro crepuscular
      skyGrad.addColorStop(0.35, '#421008'); // Rojo óxido atmosférico
      skyGrad.addColorStop(0.65, '#85240c'); // Naranja quemado intenso
      skyGrad.addColorStop(0.9, '#c74f16');  // Dorado incandescente
      skyGrad.addColorStop(1, '#e87823');    // Horizonte luminoso
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // --- CAPA 1: Sol Poniente y Resplandor Crepuscular ---
      const sunX = width * 0.5;
      const sunY = height * 0.58;
      const sunRadius = Math.max(30, Math.min(width, height) * 0.09);

      ctx.save();
      // Corona difusa amplia
      const sunGlow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.2, sunX, sunY, sunRadius * 3.5);
      sunGlow.addColorStop(0, 'rgba(255, 200, 110, 0.45)');
      sunGlow.addColorStop(0.5, 'rgba(232, 120, 35, 0.15)');
      sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Núcleo solar incandescente
      ctx.fillStyle = '#ffeed6';
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- CAPA 2: Mesetas Distantes (Silueta de Capa Lejana) ---
      ctx.save();
      ctx.fillStyle = '#4a1512';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.62);
      ctx.lineTo(width * 0.15, height * 0.62);
      ctx.lineTo(width * 0.18, height * 0.65);
      ctx.lineTo(width * 0.32, height * 0.65);
      ctx.lineTo(width * 0.35, height * 0.61);
      ctx.lineTo(width * 0.48, height * 0.61);
      ctx.lineTo(width * 0.52, height * 0.66);
      ctx.lineTo(width * 0.7, height * 0.66);
      ctx.lineTo(width * 0.74, height * 0.59);
      ctx.lineTo(width * 0.88, height * 0.59);
      ctx.lineTo(width * 0.92, height * 0.64);
      ctx.lineTo(width, height * 0.64);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- CAPA 3: Siluetas de Mesas y Buttes Intermedias ---
      ctx.save();
      const midGrad = ctx.createLinearGradient(0, height * 0.6, 0, height);
      midGrad.addColorStop(0, '#330b0b');
      midGrad.addColorStop(1, '#1a0404');
      ctx.fillStyle = midGrad;

      ctx.beginPath();
      ctx.moveTo(0, height * 0.68);
      // Mesa izquierda
      ctx.lineTo(width * 0.12, height * 0.68);
      ctx.lineTo(width * 0.16, height * 0.74);
      ctx.lineTo(width * 0.28, height * 0.74);
      ctx.lineTo(width * 0.32, height * 0.67);
      ctx.lineTo(width * 0.42, height * 0.67);
      ctx.lineTo(width * 0.46, height * 0.76);
      // Formaciones centrales recortadas
      ctx.lineTo(width * 0.62, height * 0.76);
      ctx.lineTo(width * 0.65, height * 0.69);
      ctx.lineTo(width * 0.78, height * 0.69);
      ctx.lineTo(width * 0.82, height * 0.75);
      ctx.lineTo(width, height * 0.75);
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- CAPA 4: Paredes Principales del Cañón (Primer Plano Sedimentario) ---
      ctx.save();
      const foreGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
      foreGrad.addColorStop(0, '#240606');
      foreGrad.addColorStop(0.6, '#130202');
      foreGrad.addColorStop(1, '#080101');
      ctx.fillStyle = foreGrad;

      // Pared Oeste (Izquierda escalonada con salientes angulares)
      ctx.beginPath();
      ctx.moveTo(0, height * 0.65);
      ctx.lineTo(width * 0.08, height * 0.65);
      ctx.lineTo(width * 0.11, height * 0.72);
      ctx.lineTo(width * 0.19, height * 0.72);
      ctx.lineTo(width * 0.22, height * 0.82);
      ctx.lineTo(width * 0.3, height * 0.88);
      ctx.lineTo(width * 0.35, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Borde iluminado de roca sedimentaria (resplandor rasante)
      ctx.strokeStyle = 'rgba(232, 120, 35, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.65);
      ctx.lineTo(width * 0.08, height * 0.65);
      ctx.lineTo(width * 0.11, height * 0.72);
      ctx.lineTo(width * 0.19, height * 0.72);
      ctx.lineTo(width * 0.22, height * 0.82);
      ctx.stroke();

      // Pared Este (Derecha profunda y recortada)
      ctx.beginPath();
      ctx.moveTo(width, height * 0.68);
      ctx.lineTo(width * 0.9, height * 0.68);
      ctx.lineTo(width * 0.86, height * 0.77);
      ctx.lineTo(width * 0.78, height * 0.77);
      ctx.lineTo(width * 0.72, height * 0.86);
      ctx.lineTo(width * 0.64, height);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(width, height * 0.68);
      ctx.lineTo(width * 0.9, height * 0.68);
      ctx.lineTo(width * 0.86, height * 0.77);
      ctx.lineTo(width * 0.78, height * 0.77);
      ctx.lineTo(width * 0.72, height * 0.86);
      ctx.stroke();
      ctx.restore();

      // --- CAPA 5: Calima y Partículas de Polvo Rocoso ---
      ctx.save();
      dustParticles.forEach((dp) => {
        dp.x += dp.speedX;
        dp.y += Math.sin(time + dp.x * 0.01) * 0.25;

        // Vórtice eólico ante la presencia del puntero/toque
        if (pointer.active) {
          const dx = dp.x - pointer.x;
          const dy = dp.y - pointer.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130 && dist > 1) {
            dp.x += (dx / dist) * 1.5;
            dp.y += (dy / dist) * 1.5;
          }
        }

        if (dp.x > width + 20) {
          dp.x = -20;
          dp.y = height * 0.35 + Math.random() * (height * 0.65);
        }

        ctx.fillStyle = `rgba(232, 120, 35, ${dp.alpha})`;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, dp.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();

      // --- CAPA 6: Águilas en Corrientes Ascendentes ---
      eagles.forEach((eagle) => {
        eagle.x += eagle.speedX;
        eagle.wingAngle += eagle.wingSpeed;
        if (eagle.x > width + 60) eagle.x = -60;

        ctx.save();
        ctx.translate(eagle.x, eagle.y + Math.sin(eagle.x * 0.005) * 8);
        ctx.scale(eagle.scale, eagle.scale);

        ctx.fillStyle = '#0f0202';
        ctx.strokeStyle = '#0f0202';
        ctx.lineWidth = 1.5;

        // Cuerpo
        ctx.beginPath();
        ctx.ellipse(0, 0, 7, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Alas articuladas (curvatura de planeo)
        const wingYOffset = Math.sin(eagle.wingAngle) * 4;
        ctx.beginPath();
        // Ala izquierda
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-10, -5 + wingYOffset, -22, -2 + wingYOffset);
        // Ala derecha
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(10, -5 + wingYOffset, 22, -2 + wingYOffset);
        ctx.stroke();

        ctx.restore();
      });

      animId = requestAnimationFrame(render);
    };

    // Suspensión reactiva ante cambio de pestaña (Battery/CPU Guardrail)
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
