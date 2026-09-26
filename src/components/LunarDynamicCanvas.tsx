import React, { useEffect, useRef } from 'react';

interface Crater {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  depth: number;
}

interface Rover {
  x: number;
  speed: number;
  wheelRotation: number;
  lightPhase: number;
}

interface Satellite {
  x: number;
  y: number;
  speedX: number;
  size: number;
}

export const LunarDynamicCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // 1. Cálculo matemático del perfil del terreno lunar (Regolito)
    const getTerrainHeight = (x: number): number => {
      const baseHeight = height * 0.78;
      // Superposición de ondas para generar ondulaciones naturales del regolito
      const wave1 = Math.sin(x * 0.003) * 28;
      const wave2 = Math.sin(x * 0.008 + 1.2) * 12;
      const wave3 = Math.cos(x * 0.001) * 15;
      return baseHeight + wave1 + wave2 + wave3;
    };

    // 2. Cráteres de impacto estáticos
    let craters: Crater[] = [];
    const initSurface = () => {
      craters = [];
      const craterCount = Math.floor(width / 110);
      for (let i = 0; i < craterCount; i++) {
        const x = i * 120 + Math.random() * 60;
        const groundY = getTerrainHeight(x);
        craters.push({
          x,
          y: groundY + 15 + Math.random() * Math.max(20, height - groundY - 30),
          radiusX: 18 + Math.random() * 32,
          radiusY: 6 + Math.random() * 12,
          rotation: (Math.random() - 0.5) * 0.2,
          depth: 0.6 + Math.random() * 0.4,
        });
      }
    };
    initSurface();

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initSurface();
    };
    window.addEventListener('resize', handleResize, { passive: true });

    // 3. Vehículo espacial activo (Lunar Rover)
    const rover: Rover = {
      x: 100,
      speed: 0.85,
      wheelRotation: 0,
      lightPhase: 0,
    };

    // 4. Sonda espacial / Satélite orbital
    const satellite: Satellite = {
      x: width * 0.2,
      y: height * 0.2,
      speedX: 0.25,
      size: 1.0,
    };

    // 5. Polvo cósmico y micro-meteoritos
    const dustParticles = Array.from({ length: 35 }, () => ({
      x: Math.random() * width,
      y: Math.random() * (height * 0.7),
      radius: Math.random() * 1.2 + 0.3,
      alpha: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 0.05 + 0.02,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // --- CAPA 0: Espacio profundo y vacío estéril ---
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, width, height);

      // Estrellas fijas de alto contraste y polvo cósmico
      dustParticles.forEach((p) => {
        p.alpha += (Math.random() - 0.5) * 0.04;
        p.alpha = Math.max(0.2, Math.min(0.9, p.alpha));
        ctx.fillStyle = `rgba(220, 230, 245, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // --- CAPA 1: La Tierra en el horizonte (Earthrise) ---
      const earthX = width * 0.82;
      const earthY = height * 0.22;
      const earthRadius = Math.max(35, Math.min(width, height) * 0.08);

      ctx.save();
      // Brillo atmosférico exterior
      const earthGlow = ctx.createRadialGradient(
        earthX, earthY, earthRadius * 0.8,
        earthX, earthY, earthRadius * 1.45
      );
      earthGlow.addColorStop(0, 'rgba(0, 162, 255, 0.28)');
      earthGlow.addColorStop(0.5, 'rgba(56, 189, 248, 0.1)');
      earthGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = earthGlow;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius * 1.45, 0, Math.PI * 2);
      ctx.fill();

      // Disco terrestre (Corte nocturno / diurno con gradiente de curvatura)
      const earthBody = ctx.createRadialGradient(
        earthX - earthRadius * 0.4, earthY - earthRadius * 0.4, earthRadius * 0.1,
        earthX, earthY, earthRadius
      );
      earthBody.addColorStop(0, '#38bdf8');
      earthBody.addColorStop(0.5, '#0369a1');
      earthBody.addColorStop(0.85, '#082f49');
      earthBody.addColorStop(1, '#020617');
      ctx.fillStyle = earthBody;
      ctx.beginPath();
      ctx.arc(earthX, earthY, earthRadius, 0, Math.PI * 2);
      ctx.fill();

      // Detalle continental abstracto y remolinos de nubes
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.arc(earthX - earthRadius * 0.1, earthY - earthRadius * 0.2, earthRadius * 0.6, 0, Math.PI);
      ctx.fill();
      ctx.restore();

      // --- CAPA 2: Sonda orbital / Satélite ---
      satellite.x += satellite.speedX;
      if (satellite.x > width + 100) satellite.x = -100;

      ctx.save();
      ctx.translate(satellite.x, satellite.y);
      // Chasis central de la sonda
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-6, -6, 12, 12);
      // Paneles solares laterales
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-22, -4, 14, 8);
      ctx.fillRect(8, -4, 14, 8);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(-22, -4, 14, 8);
      ctx.strokeRect(8, -4, 14, 8);
      // Antena reflectora
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, -12);
      ctx.stroke();
      ctx.restore();

      // --- CAPA 3: Montañas lunares en segundo plano (Horizonte Regolito) ---
      ctx.save();
      ctx.fillStyle = '#11141c';
      ctx.beginPath();
      ctx.moveTo(0, height * 0.72);
      for (let x = 0; x <= width; x += 40) {
        const peak = Math.sin(x * 0.002) * 55 + Math.cos(x * 0.006) * 25;
        ctx.lineTo(x, height * 0.68 + peak);
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // --- CAPA 4: Superficie Lunar (Corteza y Regolito) ---
      ctx.save();
      const terrainGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
      terrainGrad.addColorStop(0, '#1c1f2b');
      terrainGrad.addColorStop(0.3, '#141722');
      terrainGrad.addColorStop(1, '#0b0d14');
      ctx.fillStyle = terrainGrad;

      ctx.beginPath();
      ctx.moveTo(0, getTerrainHeight(0));
      for (let x = 0; x <= width; x += 15) {
        ctx.lineTo(x, getTerrainHeight(x));
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Borde superior iluminado (Highland rim con luz rasante)
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // --- CAPA 5: Cráteres Lunares Detallados ---
      craters.forEach((c) => {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rotation);

        // Borde elevado iluminado (Cresta expuesta a la luz rasante)
        ctx.beginPath();
        ctx.ellipse(0, 0, c.radiusX + 2, c.radiusY + 1.5, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fondo del cráter (Gradiente de umbra profunda y relieve)
        const craterGrad = ctx.createRadialGradient(
          -c.radiusX * 0.2, -c.radiusY * 0.3, c.radiusY * 0.1,
          0, 0, c.radiusX
        );
        craterGrad.addColorStop(0, '#050608');
        craterGrad.addColorStop(0.7, '#0d0f17');
        craterGrad.addColorStop(1, '#1e2230');

        ctx.fillStyle = craterGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, c.radiusX, c.radiusY, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sombra de eyección interior
        ctx.beginPath();
        ctx.ellipse(-c.radiusX * 0.25, 0, c.radiusX * 0.65, c.radiusY * 0.85, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fill();

        ctx.restore();
      });

      // --- CAPA 6: Vehículo Lunar (Rover Explorador en Movimiento) ---
      rover.x += rover.speed;
      rover.wheelRotation += 0.08;
      rover.lightPhase += 0.05;
      if (rover.x > width + 140) rover.x = -140;

      const currentY = getTerrainHeight(rover.x);
      // Calcular la pendiente local evaluando la altura 10px adelante
      const nextY = getTerrainHeight(rover.x + 10);
      const angle = Math.atan2(nextY - currentY, 10);

      ctx.save();
      ctx.translate(rover.x, currentY - 8);
      ctx.rotate(angle);

      // Sombra proyectada del rover en el regolito
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 26, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ruedas de malla de alambre metálico con rotación
      const drawWheel = (wx: number, wy: number) => {
        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(rover.wheelRotation);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
        ctx.stroke();
        // Radios de la rueda
        ctx.beginPath();
        ctx.moveTo(-5.5, 0); ctx.lineTo(5.5, 0);
        ctx.moveTo(0, -5.5); ctx.lineTo(0, 5.5);
        ctx.stroke();
        ctx.restore();
      };
      drawWheel(-16, 4);
      drawWheel(0, 4);
      drawWheel(16, 4);

      // Chasis y bastidor del rover
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-20, -6, 38, 6);

      // Cabina de instrumentos y baterías
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-14, -13, 16, 7);

      // Antena parabólica de alta ganancia
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-8, -17, 6, Math.PI * 0.7, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, -13);
      ctx.lineTo(-8, -17);
      ctx.stroke();

      // Foco proyector / Baliza LED estroboscópica
      const isBeaconOn = Math.sin(rover.lightPhase * 3) > 0.3;
      ctx.fillStyle = isBeaconOn ? '#38bdf8' : '#0369a1';
      ctx.beginPath();
      ctx.arc(16, -5, 2, 0, Math.PI * 2);
      ctx.fill();

      // Cono de luz frontal rasante sobre el suelo lunar
      const lightBeam = ctx.createRadialGradient(18, -4, 2, 55, 6, 45);
      lightBeam.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      lightBeam.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = lightBeam;
      ctx.beginPath();
      ctx.moveTo(18, -4);
      ctx.lineTo(85, -2);
      ctx.lineTo(75, 14);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    // Suspensión reactiva cuando la pestaña se minimiza o la pantalla se apaga
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
