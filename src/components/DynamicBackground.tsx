import React, { useEffect, useRef } from 'react';
import { ThemeId, THEMES } from '../types/theme';
import { OceanDynamicCanvas } from './OceanDynamicCanvas';
import { LunarDynamicCanvas } from './LunarDynamicCanvas';
import { CanyonDynamicCanvas } from './CanyonDynamicCanvas';
import { JungleDynamicCanvas } from './JungleDynamicCanvas';

interface Props {
  activeTheme: ThemeId;
}

export const DynamicBackground: React.FC<Props> = ({ activeTheme }) => {
  if (activeTheme === 'ocean') {
    return <OceanDynamicCanvas />;
  }

  if (activeTheme === 'lunar') {
    return <LunarDynamicCanvas />;
  }

  if (activeTheme === 'canyon') {
    return <CanyonDynamicCanvas />;
  }

  if (activeTheme === 'jungle') {
    return <JungleDynamicCanvas />;
  }

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let isTabVisible = !document.hidden;

    // Viewport dimensions
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse / Touch interactive coordinates with smooth dampening
    const mouse = {
      x: width * 0.5,
      y: height * 0.5,
      targetX: width * 0.5,
      targetY: height * 0.5,
      active: false,
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      mouse.targetX = clientX;
      mouse.targetY = clientY;
      mouse.active = true;
    };

    const handlePointerLeave = () => {
      mouse.active = false;
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('touchmove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', handlePointerLeave);

    // Particles system initialized per biome
    interface BiomeParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      alpha: number;
      baseAlpha: number;
      pulseSpeed: number;
      pulsePhase: number;
      angle: number;
      wobble: number;
      wobbleSpeed: number;
      color: string;
      secondaryColor?: string;
    }

    const particles: BiomeParticle[] = [];
    const count = activeTheme === 'space' ? 65 : 45;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        alpha: Math.random() * 0.6 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.3,
        pulseSpeed: 0.02 + Math.random() * 0.03,
        pulsePhase: Math.random() * Math.PI * 2,
        angle: Math.random() * Math.PI * 2,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.015 + Math.random() * 0.02,
        color: '#ffffff',
      });
    }

    // Occasional shooting streak / bolide for space & lunar
    let meteor = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      len: 0,
      alpha: 0,
      life: 0,
      maxLife: 50,
    };

    const spawnMeteor = () => {
      meteor.active = true;
      meteor.x = Math.random() * width * 0.8;
      meteor.y = Math.random() * height * 0.3;
      const speed = 12 + Math.random() * 8;
      const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3;
      meteor.vx = Math.cos(angle) * speed;
      meteor.vy = Math.sin(angle) * speed;
      meteor.len = 60 + Math.random() * 60;
      meteor.alpha = 1;
      meteor.life = 0;
      meteor.maxLife = 40 + Math.floor(Math.random() * 20);
    };

    let meteorTimer = 0;

    let time = 0;

    const render = () => {
      if (!isTabVisible) {
        // Paused in background to preserve battery and vehicle CPU
        return;
      }

      time += 0.016;

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      ctx.clearRect(0, 0, width, height);

      switch (activeTheme) {
        /* =========================================================================
           1. OCEAN (Fondo Marino: Rayos cáusticos submarinos + burbujas bioluminiscentes)
           ========================================================================= */
        case 'ocean': {
          // Deep Abyss Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#02182b');
          bgGrad.addColorStop(0.35, '#011627');
          bgGrad.addColorStop(1, '#000b14');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Caustic Sun Light Rays descending through water surface
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (let r = 0; r < 4; r++) {
            const rayX = width * (0.2 + r * 0.22) + Math.sin(time * 0.8 + r * 1.5) * 40;
            const rayGrad = ctx.createLinearGradient(rayX, 0, rayX + (r - 1.5) * 120, height);
            rayGrad.addColorStop(0, 'rgba(0, 250, 200, 0.16)');
            rayGrad.addColorStop(0.5, 'rgba(0, 180, 220, 0.06)');
            rayGrad.addColorStop(1, 'rgba(0, 250, 200, 0.0)');

            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(rayX - 35, 0);
            ctx.lineTo(rayX + 35, 0);
            ctx.lineTo(rayX + (r - 1.5) * 180 + 120, height);
            ctx.lineTo(rayX + (r - 1.5) * 180 - 120, height);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          // Bioluminescent Rising Bubbles with Sinusoidal Wobble & Mouse Fluid Displacement
          particles.forEach((p) => {
            p.y -= (0.4 + p.size * 0.25);
            p.wobble += p.wobbleSpeed;
            p.x += Math.sin(p.wobble) * 0.6;

            // Interactive water current from mouse/finger
            if (mouse.active) {
              const dx = p.x - mouse.x;
              const dy = p.y - mouse.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 140 && dist > 1) {
                const force = (1 - dist / 140) * 2;
                p.x += (dx / dist) * force;
                p.y += (dy / dist) * force;
              }
            }

            if (p.y < -20) {
              p.y = height + 20;
              p.x = Math.random() * width;
            }
            if (p.x < 0) p.x = width;
            if (p.x > width) p.x = 0;

            // Glowing bubble outer halo
            const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3.5);
            glow.addColorStop(0, 'rgba(0, 250, 200, 0.55)');
            glow.addColorStop(0.5, 'rgba(0, 210, 240, 0.2)');
            glow.addColorStop(1, 'rgba(0, 250, 200, 0.0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Inner core specular reflection
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.beginPath();
            ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        /* =========================================================================
           2. LUNAR (Paisaje Lunar: Regolito oscuro, polvo cósmico y cielo plateado)
           ========================================================================= */
        case 'lunar': {
          // Pitch Dark Vacuum Space Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#060609');
          bgGrad.addColorStop(0.7, '#0d0d12');
          bgGrad.addColorStop(1, '#15151c');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Subtle Lunar Horizon Silhouette at bottom
          ctx.fillStyle = '#0a0a0f';
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, height - 90);
          ctx.bezierCurveTo(
            width * 0.25, height - 120,
            width * 0.45, height - 70,
            width * 0.7, height - 105
          );
          ctx.bezierCurveTo(
            width * 0.85, height - 125,
            width * 0.95, height - 85,
            width, height - 95
          );
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();

          // Soft Earthshine / Solar Rim Light on lunar surface
          const rimGrad = ctx.createLinearGradient(0, height - 120, 0, height);
          rimGrad.addColorStop(0, 'rgba(226, 232, 240, 0.12)');
          rimGrad.addColorStop(0.2, 'rgba(148, 163, 184, 0.04)');
          rimGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = rimGrad;
          ctx.fill();

          // Electrostatic Suspended Regolito Dust & Fine Stars
          particles.forEach((p) => {
            p.pulsePhase += p.pulseSpeed;
            const currentAlpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.25;

            p.x -= 0.12;
            p.y += Math.sin(p.pulsePhase * 0.5) * 0.15;

            // Interactive gravity response to pointer
            if (mouse.active) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 160 && dist > 1) {
                p.x += (dx / dist) * 0.8;
                p.y += (dy / dist) * 0.8;
              }
            }

            if (p.x < 0) p.x = width;
            if (p.y > height) p.y = 0;
            if (p.y < 0) p.y = height;

            ctx.fillStyle = `rgba(241, 245, 249, ${Math.max(0.1, currentAlpha)})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.75, 0, Math.PI * 2);
            ctx.fill();

            // Specular spike for bright cosmic dust
            if (p.size > 2.6) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha * 0.4})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(p.x - 3, p.y);
              ctx.lineTo(p.x + 3, p.y);
              ctx.moveTo(p.x, p.y - 3);
              ctx.lineTo(p.x, p.y + 3);
              ctx.stroke();
            }
          });

          // Occasional passing micrometeorite
          meteorTimer++;
          if (meteorTimer > 280 && !meteor.active && Math.random() < 0.05) {
            spawnMeteor();
            meteorTimer = 0;
          }
          if (meteor.active) {
            meteor.life++;
            meteor.x += meteor.vx;
            meteor.y += meteor.vy;
            meteor.alpha = 1 - meteor.life / meteor.maxLife;

            const meteorGrad = ctx.createLinearGradient(
              meteor.x, meteor.y,
              meteor.x - meteor.vx * 3.5, meteor.y - meteor.vy * 3.5
            );
            meteorGrad.addColorStop(0, `rgba(255, 255, 255, ${meteor.alpha})`);
            meteorGrad.addColorStop(0.3, `rgba(226, 232, 240, ${meteor.alpha * 0.7})`);
            meteorGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.strokeStyle = meteorGrad;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(meteor.x, meteor.y);
            ctx.lineTo(meteor.x - meteor.vx * 3.5, meteor.y - meteor.vy * 3.5);
            ctx.stroke();

            if (meteor.life >= meteor.maxLife) {
              meteor.active = false;
            }
          }
          break;
        }

        /* =========================================================================
           3. CANYON (Gran Cañón: Crepúsculo Colorado, arenisca roja y calima cálida)
           ========================================================================= */
        case 'canyon': {
          // Warm Twilight Desert Sky Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#100504');
          bgGrad.addColorStop(0.5, '#1e0c08');
          bgGrad.addColorStop(1, '#34140b');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Deep layered canyon mesas and rock silhouettes
          // Layer 1 (Distant mesa)
          ctx.fillStyle = 'rgba(40, 16, 10, 0.75)';
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, height - 160);
          ctx.lineTo(width * 0.22, height - 160);
          ctx.lineTo(width * 0.26, height - 130);
          ctx.lineTo(width * 0.48, height - 130);
          ctx.lineTo(width * 0.52, height - 175);
          ctx.lineTo(width * 0.74, height - 175);
          ctx.lineTo(width * 0.78, height - 140);
          ctx.lineTo(width, height - 140);
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();

          // Layer 2 (Foreground canyon rim)
          ctx.fillStyle = 'rgba(20, 7, 4, 0.9)';
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, height - 80);
          ctx.lineTo(width * 0.15, height - 95);
          ctx.lineTo(width * 0.35, height - 60);
          ctx.lineTo(width * 0.65, height - 105);
          ctx.lineTo(width * 0.85, height - 70);
          ctx.lineTo(width, height - 85);
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();

          // Radiant canyon sunset horizon glow
          const duskGlow = ctx.createRadialGradient(
            width * 0.5, height - 100, 20,
            width * 0.5, height - 100, width * 0.75
          );
          duskGlow.addColorStop(0, 'rgba(255, 107, 53, 0.25)');
          duskGlow.addColorStop(0.5, 'rgba(249, 115, 22, 0.1)');
          duskGlow.addColorStop(1, 'transparent');
          ctx.fillStyle = duskGlow;
          ctx.fillRect(0, 0, width, height);

          // Airborne Sand & Terracotta Dust Particles in horizontal desert wind
          particles.forEach((p) => {
            p.x += 0.8 + p.size * 0.3;
            p.y += Math.sin((p.x + time * 30) * 0.012) * 0.45;

            // Wind vortex disturbance around mouse
            if (mouse.active) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 150 && dist > 1) {
                // Whirlwind vortex
                p.x -= (dy / dist) * 1.5;
                p.y += (dx / dist) * 1.5;
              }
            }

            if (p.x > width + 20) {
              p.x = -20;
              p.y = Math.random() * height;
            }

            const pGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
            pGlow.addColorStop(0, 'rgba(255, 140, 66, 0.7)');
            pGlow.addColorStop(0.6, 'rgba(255, 107, 53, 0.3)');
            pGlow.addColorStop(1, 'rgba(255, 107, 53, 0)');
            ctx.fillStyle = pGlow;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        /* =========================================================================
           4. SAVANNA (Sabana Africana: Atardecer dorado, bruma térmica y polen flotante)
           ========================================================================= */
        case 'savanna': {
          // Warm Golden Sunset Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#120b02');
          bgGrad.addColorStop(0.5, '#221404');
          bgGrad.addColorStop(1, '#3a2206');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Vast Flat Savanna Horizon Silhouette
          ctx.fillStyle = '#0f0802';
          ctx.beginPath();
          ctx.moveTo(0, height);
          ctx.lineTo(0, height - 70);
          ctx.quadraticCurveTo(width * 0.3, height - 85, width * 0.6, height - 65);
          ctx.quadraticCurveTo(width * 0.85, height - 55, width, height - 75);
          ctx.lineTo(width, height);
          ctx.closePath();
          ctx.fill();

          // Stylized Acacia Canopy Silhouette on the right side
          const treeX = width * 0.82;
          const treeBaseY = height - 70;
          ctx.fillStyle = 'rgba(15, 8, 2, 0.95)';

          // Trunk
          ctx.beginPath();
          ctx.moveTo(treeX - 4, treeBaseY);
          ctx.lineTo(treeX - 2, treeBaseY - 80);
          ctx.lineTo(treeX + 4, treeBaseY - 80);
          ctx.lineTo(treeX + 5, treeBaseY);
          ctx.closePath();
          ctx.fill();

          // Flat umbrella foliage canopies
          ctx.beginPath();
          ctx.ellipse(treeX - 25, treeBaseY - 85, 35, 10, -0.05, 0, Math.PI * 2);
          ctx.ellipse(treeX + 25, treeBaseY - 95, 42, 11, 0.08, 0, Math.PI * 2);
          ctx.ellipse(treeX, treeBaseY - 105, 30, 9, 0, 0, Math.PI * 2);
          ctx.fill();

          // Radiant Sun Core & Heat Shimmer Haze
          const sunGlow = ctx.createRadialGradient(
            width * 0.35, height - 90, 10,
            width * 0.35, height - 90, width * 0.6
          );
          sunGlow.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
          sunGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.15)');
          sunGlow.addColorStop(1, 'transparent');
          ctx.fillStyle = sunGlow;
          ctx.fillRect(0, 0, width, height);

          // Warm Embers & Acacia Pollen Drifting Upwards in Thermal Currents
          particles.forEach((p) => {
            p.y -= 0.35 + p.size * 0.15;
            p.wobble += p.wobbleSpeed * 0.7;
            p.x += Math.sin(p.wobble) * 0.5 + 0.2;

            // Thermal push on mouse interaction
            if (mouse.active) {
              const dx = p.x - mouse.x;
              const dy = p.y - mouse.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 130 && dist > 1) {
                p.y -= (1 - dist / 130) * 3;
                p.x += (dx / dist) * 1.2;
              }
            }

            if (p.y < -15) {
              p.y = height + 15;
              p.x = Math.random() * width;
            }
            if (p.x > width + 10) p.x = -10;

            p.pulsePhase += p.pulseSpeed;
            const alpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.25;

            // Warm golden glow
            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.8);
            halo.addColorStop(0, `rgba(253, 224, 71, ${Math.max(0.1, alpha)})`);
            halo.addColorStop(0.5, `rgba(245, 158, 11, ${Math.max(0.05, alpha * 0.5)})`);
            halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 2.8, 0, Math.PI * 2);
            ctx.fill();

            // Core speck
            ctx.fillStyle = 'rgba(255, 255, 230, 0.9)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        /* =========================================================================
           5. JUNGLE (Selva Amazónica: Dosel esmeralda, luciérnagas y esporas)
           ========================================================================= */
        case 'jungle': {
          // Deep Rainforest Jungle Night Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#011207');
          bgGrad.addColorStop(0.5, '#02180b');
          bgGrad.addColorStop(1, '#052a14');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Deep Foliage Canopy Silhouette at top & sides
          ctx.fillStyle = 'rgba(2, 20, 9, 0.7)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(width, 0);
          ctx.lineTo(width, 60);
          ctx.bezierCurveTo(width * 0.8, 120, width * 0.6, 40, width * 0.45, 95);
          ctx.bezierCurveTo(width * 0.3, 140, width * 0.1, 70, 0, 110);
          ctx.closePath();
          ctx.fill();

          // Bioluminescent Amazonian Fireflies (Luciérnagas) with Organic Flight Physics
          particles.forEach((p) => {
            p.angle += 0.02;
            p.wobble += p.wobbleSpeed;
            p.x += Math.cos(p.angle) * 0.8 + Math.sin(p.wobble) * 0.4;
            p.y += Math.sin(p.angle) * 0.8 + Math.cos(p.wobble) * 0.4;

            // Fireflies gently swarm towards or dance around pointer
            if (mouse.active) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 180 && dist > 1) {
                // Attracted with gentle orbital steering
                p.x += (dx / dist) * 0.9;
                p.y += (dy / dist) * 0.9;
              }
            }

            if (p.x < -20) p.x = width + 20;
            if (p.x > width + 20) p.x = -20;
            if (p.y < -20) p.y = height + 20;
            if (p.y > height + 20) p.y = -20;

            // Breathing / Pulsing Glow Characteristic of tropical fireflies
            p.pulsePhase += p.pulseSpeed * 1.5;
            const glowFactor = Math.pow(Math.sin(p.pulsePhase) * 0.5 + 0.5, 2);
            const radius = (p.size + 1.5) * (1 + glowFactor * 1.2);

            const fireflyGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 3.5);
            fireflyGrad.addColorStop(0, `rgba(74, 222, 128, ${0.4 + glowFactor * 0.55})`);
            fireflyGrad.addColorStop(0.4, `rgba(34, 197, 94, ${0.2 + glowFactor * 0.3})`);
            fireflyGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');

            ctx.fillStyle = fireflyGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius * 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Bright inner jewel spark
            ctx.fillStyle = `rgba(220, 252, 231, ${0.5 + glowFactor * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.65, 0, Math.PI * 2);
            ctx.fill();
          });
          break;
        }

        /* =========================================================================
           6. SPACE (Espacio Exterior: Cosmos realista con estrellas y polvo estelar)
           ========================================================================= */
        case 'space':
        default: {
          // Deep Space Dark Gradient
          const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
          bgGrad.addColorStop(0, '#03050c');
          bgGrad.addColorStop(0.5, '#040711');
          bgGrad.addColorStop(1, '#070f20');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, width, height);

          // Nebula Cosmic Clouds Layer
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const neb1 = ctx.createRadialGradient(
            width * 0.25, height * 0.3, 20,
            width * 0.25, height * 0.3, width * 0.45
          );
          neb1.addColorStop(0, 'rgba(0, 229, 255, 0.08)');
          neb1.addColorStop(0.6, 'rgba(139, 92, 246, 0.04)');
          neb1.addColorStop(1, 'transparent');
          ctx.fillStyle = neb1;
          ctx.fillRect(0, 0, width, height);

          const neb2 = ctx.createRadialGradient(
            width * 0.75, height * 0.7, 30,
            width * 0.75, height * 0.7, width * 0.5
          );
          neb2.addColorStop(0, 'rgba(16, 185, 129, 0.06)');
          neb2.addColorStop(0.7, 'rgba(6, 182, 212, 0.03)');
          neb2.addColorStop(1, 'transparent');
          ctx.fillStyle = neb2;
          ctx.fillRect(0, 0, width, height);
          ctx.restore();

          // Stars & Cosmic Dust Particles
          particles.forEach((p) => {
            p.y += (0.15 + p.size * 0.08);
            p.pulsePhase += p.pulseSpeed;

            // Interactive gravity warp from mouse
            if (mouse.active) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 140 && dist > 1) {
                p.x += (dx / dist) * 0.7;
                p.y += (dy / dist) * 0.7;
              }
            }

            if (p.y > height) {
              p.y = 0;
              p.x = Math.random() * width;
            }

            const currentAlpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.35;
            const alphaClamped = Math.max(0.15, Math.min(1, currentAlpha));

            ctx.fillStyle = `rgba(255, 255, 255, ${alphaClamped})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
            ctx.fill();

            // Cross spike on luminous primary stars
            if (p.size > 2.7) {
              ctx.strokeStyle = `rgba(0, 229, 255, ${alphaClamped * 0.5})`;
              ctx.lineWidth = 0.8;
              ctx.beginPath();
              ctx.moveTo(p.x - 4, p.y);
              ctx.lineTo(p.x + 4, p.y);
              ctx.moveTo(p.x, p.y - 4);
              ctx.lineTo(p.x, p.y + 4);
              ctx.stroke();
            }
          });

          // Occasional cosmic bolide / shooting star
          meteorTimer++;
          if (meteorTimer > 240 && !meteor.active && Math.random() < 0.07) {
            spawnMeteor();
            meteorTimer = 0;
          }
          if (meteor.active) {
            meteor.life++;
            meteor.x += meteor.vx;
            meteor.y += meteor.vy;
            meteor.alpha = 1 - meteor.life / meteor.maxLife;

            const meteorGrad = ctx.createLinearGradient(
              meteor.x, meteor.y,
              meteor.x - meteor.vx * 4, meteor.y - meteor.vy * 4
            );
            meteorGrad.addColorStop(0, `rgba(255, 255, 255, ${meteor.alpha})`);
            meteorGrad.addColorStop(0.2, `rgba(0, 229, 255, ${meteor.alpha * 0.8})`);
            meteorGrad.addColorStop(1, 'rgba(0, 229, 255, 0)');

            ctx.strokeStyle = meteorGrad;
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(meteor.x, meteor.y);
            ctx.lineTo(meteor.x - meteor.vx * 4, meteor.y - meteor.vy * 4);
            ctx.stroke();

            if (meteor.life >= meteor.maxLife) {
              meteor.active = false;
            }
          }
          break;
        }
      }

      animId = requestAnimationFrame(render);
    };

    // Auto-pause when tab is hidden to preserve battery & CPU in cars and smartphones
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        cancelAnimationFrame(animId);
        animId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animId);
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
  }, [activeTheme]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10 w-full h-full transition-opacity duration-700"
    />
  );
};
