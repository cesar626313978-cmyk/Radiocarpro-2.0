import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Types for transient cosmic visitors
type VisitorType = 'comet' | 'rocket' | 'spaceStation' | 'ufo' | 'satellite' | 'meteor' | 'probe';

interface CosmicVisitor {
  id: string;
  type: VisitorType;
  startX: number; // percentage 0 - 100
  startY: number; // percentage 0 - 100
  endX: number;
  endY: number;
  duration: number; // in seconds
  scale: number;
  rotation?: number;
  createdAt: number;
}

export const RealisticSpaceCosmos: React.FC = () => {
  // 1. Static & Twinkling Stars (high density, 3 depth layers)
  const [stars] = useState(() => {
    return Array.from({ length: 110 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() < 0.6 ? 1 : Math.random() < 0.9 ? 1.8 : 2.6,
      opacity: Math.random() * 0.7 + 0.3,
      duration: Math.random() * 4 + 2.5,
      delay: Math.random() * 3,
      color:
        Math.random() > 0.85
          ? '#93c5fd' // Blue-white
          : Math.random() > 0.75
          ? '#fed7aa' // Amber star
          : Math.random() > 0.65
          ? '#c4b5fd' // Violet star
          : '#ffffff',
      hasSpikes: Math.random() > 0.92, // Bright diffraction spikes
    }));
  });

  // 2. Active transient cosmic visitors queue
  const [visitors, setVisitors] = useState<CosmicVisitor[]>([]);
  const visitorCountRef = useRef(0);

  // Helper to spawn a new visitor with realistic orbital and celestial parameters
  const spawnVisitor = (type: VisitorType) => {
    const id = `visitor-${Date.now()}-${visitorCountRef.current++}`;
    let startX = 0;
    let startY = 0;
    let endX = 100;
    let endY = 100;
    let duration = 20;
    let scale = 1;
    let rotation = 0;

    switch (type) {
      case 'comet': {
        // High diagonal crossing, bright and majestic with coma and ion tail
        const fromTop = Math.random() > 0.5;
        startX = fromTop ? Math.random() * 40 - 15 : Math.random() * 25 - 20;
        startY = fromTop ? Math.random() * 25 - 15 : Math.random() * 50;
        endX = startX + 110 + Math.random() * 20;
        endY = startY + 65 + Math.random() * 40;
        duration = 18 + Math.random() * 8;
        scale = 0.85 + Math.random() * 0.35;
        rotation = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
        break;
      }
      case 'meteor': {
        // Fast shooting star / bolide
        startX = 10 + Math.random() * 80;
        startY = 5 + Math.random() * 40;
        const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.6;
        const length = 22 + Math.random() * 25;
        endX = startX + Math.cos(angle) * length;
        endY = startY + Math.sin(angle) * length;
        duration = 0.8 + Math.random() * 0.5;
        scale = 0.7 + Math.random() * 0.5;
        rotation = angle * (180 / Math.PI);
        break;
      }
      case 'rocket': {
        // Ascending space launch vehicle (Falcon/Starship) with supersonic flame plume
        startX = Math.random() * 30 - 10;
        startY = 85 + Math.random() * 25;
        endX = startX + 115;
        endY = startY - 75 - Math.random() * 25;
        duration = 24 + Math.random() * 8;
        scale = 0.75 + Math.random() * 0.3;
        rotation = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
        break;
      }
      case 'spaceStation': {
        // Slow realistic orbital transit (ISS style modular space laboratory)
        const leftToRight = Math.random() > 0.5;
        startX = leftToRight ? -15 : 115;
        endX = leftToRight ? 115 : -15;
        startY = 10 + Math.random() * 32;
        endY = startY + (Math.random() - 0.5) * 12;
        duration = 32 + Math.random() * 12;
        scale = 0.8 + Math.random() * 0.3;
        rotation = leftToRight ? 4 : 184;
        break;
      }
      case 'probe': {
        // Deep space exploration probe (Voyager style) drifting through interstellar void
        const leftToRight = Math.random() > 0.5;
        startX = leftToRight ? -12 : 112;
        endX = leftToRight ? 112 : -12;
        startY = 62 + Math.random() * 24;
        endY = startY - 12 + Math.random() * 8;
        duration = 36 + Math.random() * 10;
        scale = 0.75 + Math.random() * 0.25;
        rotation = leftToRight ? 12 : 192;
        break;
      }
      case 'satellite': {
        // Tiny glinting orbital craft with specular solar flare
        startX = Math.random() * 100;
        startY = -10;
        endX = startX + (Math.random() - 0.5) * 35;
        endY = 110;
        duration = 22 + Math.random() * 6;
        scale = 0.6 + Math.random() * 0.35;
        rotation = 0;
        break;
      }
      case 'ufo': {
        // Mysterious deep space reconnaissance UAP / exotic craft
        const fromLeft = Math.random() > 0.5;
        startX = fromLeft ? -10 : 110;
        endX = fromLeft ? 110 : -10;
        startY = 22 + Math.random() * 52;
        endY = startY + (Math.random() - 0.5) * 28;
        duration = 16 + Math.random() * 6;
        scale = 0.7 + Math.random() * 0.35;
        rotation = fromLeft ? 0 : 180;
        break;
      }
    }

    const newVisitor: CosmicVisitor = {
      id,
      type,
      startX,
      startY,
      endX,
      endY,
      duration,
      scale,
      rotation,
      createdAt: Date.now(),
    };

    setVisitors(prev => [...prev.slice(-7), newVisitor]);

    // Automatically clean up after animation finishes
    setTimeout(() => {
      setVisitors(prev => prev.filter(v => v.id !== id));
    }, (duration + 1) * 1000);
  };

  // Randomized scheduler that guarantees celestial life appears periodically
  useEffect(() => {
    // Initial immediate events after mounting
    const t1 = setTimeout(() => spawnVisitor('comet'), 1500);
    const t2 = setTimeout(() => spawnVisitor('meteor'), 4000);
    const t3 = setTimeout(() => spawnVisitor('spaceStation'), 7500);
    const t4 = setTimeout(() => spawnVisitor('rocket'), 12500);
    const t5 = setTimeout(() => spawnVisitor('ufo'), 18000);
    const t6 = setTimeout(() => spawnVisitor('probe'), 23000);

    // Continuous intervals
    // Meteors: frequent (every 7-10s)
    const meteorInterval = setInterval(() => {
      spawnVisitor('meteor');
    }, 7800);

    // Satellites: every 20s
    const satInterval = setInterval(() => {
      spawnVisitor('satellite');
    }, 20000);

    // Comets: every 28s
    const cometInterval = setInterval(() => {
      spawnVisitor('comet');
    }, 28000);

    // Spacecraft / Rockets / Stations / Probes / UFOs: every 15-20s cycling
    const types: VisitorType[] = ['rocket', 'spaceStation', 'ufo', 'probe', 'comet'];
    let typeIdx = 0;
    const craftInterval = setInterval(() => {
      const selectedType = types[typeIdx % types.length];
      typeIdx++;
      spawnVisitor(selectedType);
    }, 16000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearInterval(meteorInterval);
      clearInterval(satInterval);
      clearInterval(cometInterval);
      clearInterval(craftInterval);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* ========================================================================= */}
      {/* 1. DEEP SPACE NEBULAE & COSMIC DUST CLOUDS                                */}
      {/* ========================================================================= */}
      <div className="absolute -top-40 -left-40 w-[720px] h-[720px] bg-gradient-to-br from-indigo-950/30 via-purple-900/15 to-transparent rounded-full blur-[140px] opacity-80" />
      <div className="absolute -bottom-40 -right-40 w-[760px] h-[760px] bg-gradient-to-tl from-cyan-950/35 via-blue-950/20 to-transparent rounded-full blur-[150px] opacity-85" />
      <div className="absolute top-1/3 left-1/4 w-[500px] h-[350px] bg-gradient-to-r from-violet-950/15 via-pink-950/10 to-transparent rounded-full blur-[130px] rotate-12" />

      {/* ========================================================================= */}
      {/* 2. REALISTIC CELESTIAL BODIES (RINGED GAS GIANT, MOON, AZURE EXOPLANET)   */}
      {/* ========================================================================= */}

      {/* A. DISTANT RINGED GAS GIANT (TOP RIGHT HORIZON) */}
      <motion.div
        className="absolute top-[6%] right-[5%] sm:right-[10%] pointer-events-none opacity-85"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 0.88, scale: 1 }}
        transition={{ duration: 3, ease: 'easeOut' }}
      >
        <svg width="220" height="150" viewBox="0 0 220 150" className="overflow-visible drop-shadow-[0_0_20px_rgba(245,158,11,0.25)]">
          <defs>
            {/* Planet surface spherical shading */}
            <radialGradient id="gasPlanetGlow" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="25%" stopColor="#fcd34d" />
              <stop offset="50%" stopColor="#b45309" />
              <stop offset="75%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#1e1b18" />
            </radialGradient>

            {/* Atmosphere limb glow */}
            <radialGradient id="planetLimb" cx="35%" cy="30%" r="70%">
              <stop offset="60%" stopColor="transparent" />
              <stop offset="90%" stopColor="rgba(253, 230, 138, 0.4)" />
              <stop offset="100%" stopColor="rgba(217, 119, 6, 0.9)" />
            </radialGradient>

            {/* Ring gradient with Cassini division */}
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(254, 243, 199, 0.05)" />
              <stop offset="20%" stopColor="rgba(252, 211, 77, 0.45)" />
              <stop offset="45%" stopColor="rgba(217, 119, 6, 0.7)" />
              <stop offset="50%" stopColor="rgba(0, 0, 0, 0.85)" /> {/* Cassini Division gap */}
              <stop offset="55%" stopColor="rgba(245, 158, 11, 0.55)" />
              <stop offset="85%" stopColor="rgba(217, 119, 6, 0.25)" />
              <stop offset="100%" stopColor="rgba(254, 243, 199, 0.02)" />
            </linearGradient>

            {/* Ring shadow on planet hemisphere */}
            <linearGradient id="ringShadow" x1="30%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="rgba(0, 0, 0, 0.75)" />
              <stop offset="60%" stopColor="rgba(0, 0, 0, 0.85)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          {/* Back portion of the rings (behind planet) */}
          <g transform="rotate(-22 110 75)">
            <ellipse cx="110" cy="75" rx="100" ry="24" fill="none" stroke="url(#ringGrad)" strokeWidth="16" opacity="0.6" />
            <ellipse cx="110" cy="75" rx="82" ry="19" fill="none" stroke="url(#ringGrad)" strokeWidth="8" opacity="0.75" />
          </g>

          {/* Planet Sphere */}
          <circle cx="110" cy="75" r="42" fill="url(#gasPlanetGlow)" />

          {/* Atmospheric cloud bands */}
          <g opacity="0.45">
            <ellipse cx="110" cy="65" rx="41" ry="8" fill="#fef3c7" opacity="0.15" />
            <ellipse cx="110" cy="73" rx="42" ry="9" fill="#78350f" opacity="0.25" />
            <ellipse cx="110" cy="82" rx="41" ry="8" fill="#d97706" opacity="0.2" />
            <ellipse cx="110" cy="90" rx="38" ry="7" fill="#451a03" opacity="0.3" />
          </g>

          {/* Ring shadow cast across planet equator */}
          <ellipse cx="110" cy="75" rx="42" ry="12" fill="url(#ringShadow)" opacity="0.7" />

          {/* Atmosphere limb glow edge */}
          <circle cx="110" cy="75" r="42" fill="url(#planetLimb)" />

          {/* Front portion of the rings (in front of planet) */}
          <g transform="rotate(-22 110 75)">
            <path
              d="M 10,75 A 100 24 0 0 0 210,75"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="16"
              strokeLinecap="round"
              opacity="0.9"
            />
            <path
              d="M 28,75 A 82 19 0 0 0 192,75"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth="8"
              strokeLinecap="round"
              opacity="0.95"
            />
          </g>
        </svg>

        {/* Orbiting natural moon dot */}
        <motion.div
          className="absolute w-2 h-2 rounded-full bg-amber-100 shadow-[0_0_8px_rgba(254,243,199,0.8)]"
          animate={{
            x: [10, 200, 10],
            y: [40, 100, 40],
            scale: [0.7, 1.1, 0.7],
          }}
          transition={{
            duration: 48,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      </motion.div>

      {/* B. DETAILED CRATERED MOON WITH TERMINATOR (BOTTOM LEFT HORIZON) */}
      <motion.div
        className="absolute bottom-[8%] left-[5%] sm:left-[8%] pointer-events-none opacity-80"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.82, scale: 1 }}
        transition={{ duration: 2.5, ease: 'easeOut' }}
      >
        <svg width="120" height="120" viewBox="0 0 120 120" className="overflow-visible drop-shadow-[0_0_24px_rgba(186,230,253,0.22)]">
          <defs>
            <radialGradient id="moonGlow" cx="28%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="35%" stopColor="#cbd5e1" />
              <stop offset="65%" stopColor="#64748b" />
              <stop offset="85%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>

            <radialGradient id="ashenGlow" cx="65%" cy="65%" r="60%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="70%" stopColor="rgba(56, 189, 248, 0.08)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.95)" />
            </radialGradient>
          </defs>

          {/* Ashen light dark side */}
          <circle cx="60" cy="60" r="44" fill="#030712" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="1" />
          <circle cx="60" cy="60" r="44" fill="url(#ashenGlow)" />

          {/* Illuminated Crescent Hemisphere with realistic terminator */}
          <path
            d="M 60,16 A 44 44 0 0 1 60,104 A 32 44 0 0 0 60,16 Z"
            fill="url(#moonGlow)"
          />

          {/* Lunar Maria (Dark Basaltic Plains) on illuminated crescent */}
          <g opacity="0.35">
            <ellipse cx="48" cy="45" rx="7" ry="5" fill="#475569" />
            <ellipse cx="42" cy="58" rx="8" ry="6" fill="#334155" />
            <ellipse cx="50" cy="72" rx="9" ry="7" fill="#475569" />
            <circle cx="38" cy="38" r="3.5" fill="#64748b" />
          </g>

          {/* Impact Craters with rim highlights */}
          <g opacity="0.7">
            <circle cx="40" cy="48" r="3" fill="#1e293b" stroke="#f1f5f9" strokeWidth="0.7" />
            <circle cx="49" cy="63" r="4" fill="#1e293b" stroke="#e2e8f0" strokeWidth="0.8" />
            <circle cx="36" cy="72" r="2.5" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.6" />
            {/* Crater Tycho with bright ejecta rays */}
            <circle cx="52" cy="84" r="2.2" fill="#0f172a" stroke="#ffffff" strokeWidth="1" />
            <line x1="52" y1="84" x2="42" y2="76" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />
            <line x1="52" y1="84" x2="56" y2="70" stroke="#ffffff" strokeWidth="0.5" opacity="0.5" />
          </g>

          {/* Outer limb soft glow */}
          <path
            d="M 60,16 A 44 44 0 0 1 60,104"
            fill="none"
            stroke="rgba(224, 242, 254, 0.45)"
            strokeWidth="1.5"
          />
        </svg>
      </motion.div>

      {/* C. DISTANT AZURE EXOPLANET / ICE WORLD (TOP LEFT HORIZON) */}
      <motion.div
        className="absolute top-[14%] left-[4%] sm:left-[7%] pointer-events-none opacity-80"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.85, scale: 1 }}
        transition={{ duration: 3.5, ease: 'easeOut' }}
      >
        <svg width="90" height="90" viewBox="0 0 90 90" className="overflow-visible drop-shadow-[0_0_20px_rgba(56,189,248,0.35)]">
          <defs>
            <radialGradient id="azureWorld" cx="30%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#bae6fd" />
              <stop offset="25%" stopColor="#38bdf8" />
              <stop offset="55%" stopColor="#0284c7" />
              <stop offset="85%" stopColor="#082f49" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
            <radialGradient id="azureLimb" cx="30%" cy="30%" r="72%">
              <stop offset="70%" stopColor="transparent" />
              <stop offset="92%" stopColor="rgba(56, 189, 248, 0.5)" />
              <stop offset="100%" stopColor="rgba(186, 230, 253, 0.9)" />
            </radialGradient>
          </defs>
          <circle cx="45" cy="45" r="30" fill="url(#azureWorld)" />
          {/* Swirling planetary clouds / weather systems */}
          <path d="M 24,38 Q 42,30 64,40 Q 48,44 24,38 Z" fill="#ffffff" opacity="0.3" />
          <path d="M 20,50 Q 38,54 68,46 Q 46,58 20,50 Z" fill="#ffffff" opacity="0.25" />
          <path d="M 28,28 Q 46,26 60,32" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.2" />
          {/* Atmospheric Rayleigh scattering corona */}
          <circle cx="45" cy="45" r="30" fill="url(#azureLimb)" />
        </svg>
      </motion.div>

      {/* ========================================================================= */}
      {/* 3. TWINKLING REALISTIC STARFIELD (WITH DIFFRACTION SPIKES ON BRIGHT ONES)  */}
      {/* ========================================================================= */}
      {stars.map(star => (
        <motion.div
          key={star.id}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.color,
            boxShadow: star.size > 1.8 ? `0 0 6px ${star.color}` : 'none',
          }}
          animate={{
            opacity: [star.opacity * 0.3, star.opacity, star.opacity * 0.3],
            scale: [0.85, 1.25, 0.85],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            delay: star.delay,
            ease: 'easeInOut',
          }}
        >
          {star.hasSpikes && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none opacity-40">
              <div className="absolute top-1/2 left-0 right-0 h-[0.5px] bg-cyan-200" />
              <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-cyan-200" />
            </div>
          )}
        </motion.div>
      ))}

      {/* ========================================================================= */}
      {/* 4. ACTIVE TRANSIENT VISITORS (COMETS, ROCKETS, STATIONS, UFOs, METEORS)   */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {visitors.map(visitor => {
          return (
            <motion.div
              key={visitor.id}
              className="absolute pointer-events-none z-10"
              initial={{
                left: `${visitor.startX}%`,
                top: `${visitor.startY}%`,
                opacity: 0,
                scale: visitor.scale * 0.7,
              }}
              animate={{
                left: `${visitor.endX}%`,
                top: `${visitor.endY}%`,
                opacity: [0, 0.95, 0.95, 0],
                scale: visitor.scale,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: visitor.duration,
                ease: visitor.type === 'meteor' ? 'easeIn' : 'linear',
                times: [0, 0.08, 0.88, 1],
              }}
            >
              {/* ------------------------------------------------------------------- */}
              {/* COMET (High-detail nucleus, cyan ion tail, golden curved dust tail) */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'comet' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <svg width="260" height="90" viewBox="0 0 260 90" className="overflow-visible">
                    <defs>
                      {/* Ion Tail (Cyan/Electric Blue) */}
                      <linearGradient id="ionTail" x1="100%" y1="50%" x2="0%" y2="50%">
                        <stop offset="0%" stopColor="rgba(56, 189, 248, 0.95)" />
                        <stop offset="30%" stopColor="rgba(6, 182, 212, 0.5)" />
                        <stop offset="70%" stopColor="rgba(14, 165, 233, 0.15)" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>

                      {/* Dust Tail (Curved Golden / White) */}
                      <linearGradient id="dustTail" x1="100%" y1="50%" x2="0%" y2="80%">
                        <stop offset="0%" stopColor="rgba(254, 243, 199, 0.85)" />
                        <stop offset="40%" stopColor="rgba(251, 191, 36, 0.35)" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>

                      {/* Nucleus Glow */}
                      <radialGradient id="nucleusGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="40%" stopColor="#a5f3fc" />
                        <stop offset="80%" stopColor="#0891b2" />
                        <stop offset="100%" stopColor="transparent" />
                      </radialGradient>
                    </defs>

                    {/* Curved Dust Tail */}
                    <path
                      d="M 210,45 Q 120,65 0,85 L 0,65 Q 130,48 210,45 Z"
                      fill="url(#dustTail)"
                      opacity="0.8"
                    />

                    {/* Straight Ion Tail (Sunlight radiation pressure) */}
                    <polygon
                      points="215,45 10,36 10,54"
                      fill="url(#ionTail)"
                      opacity="0.85"
                    />

                    {/* Gaseous Coma */}
                    <circle cx="215" cy="45" r="16" fill="url(#nucleusGlow)" opacity="0.9" />

                    {/* Solid Icy Nucleus (Brilliant Point of Light) */}
                    <circle cx="215" cy="45" r="3.5" fill="#ffffff" className="drop-shadow-[0_0_10px_#ffffff]" />
                    <line x1="205" y1="45" x2="225" y2="45" stroke="#ffffff" strokeWidth="1" opacity="0.8" />
                    <line x1="215" y1="35" x2="215" y2="55" stroke="#ffffff" strokeWidth="1" opacity="0.8" />
                  </svg>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* METEOR (Fast shooting star with glowing ablation streak)            */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'meteor' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <div className="w-24 sm:w-36 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-white rounded-full shadow-[0_0_12px_#38bdf8]" />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-[0_0_8px_#ffffff]" />
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* SPACE ROCKET (Falcon/Starship ascent with fiery Mach shock plume)   */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'rocket' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <svg width="180" height="40" viewBox="0 0 180 40" className="overflow-visible">
                    <defs>
                      {/* Fiery Exhaust Plasma */}
                      <linearGradient id="rocketFire" x1="100%" y1="50%" x2="0%" y2="50%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="20%" stopColor="#38bdf8" /> {/* Electric blue core */}
                        <stop offset="45%" stopColor="#f59e0b" /> {/* Vivid fiery orange */}
                        <stop offset="75%" stopColor="#ef4444" />
                        <stop offset="100%" stopColor="transparent" />
                      </linearGradient>
                    </defs>

                    {/* Rocket Exhaust Plume */}
                    <polygon
                      points="120,20 0,13 0,27"
                      fill="url(#rocketFire)"
                      opacity="0.9"
                    />

                    {/* Mach Diamonds (Shock nodes) */}
                    <circle cx="100" cy="20" r="3" fill="#ffffff" opacity="0.95" />
                    <circle cx="80" cy="20" r="2.5" fill="#fde047" opacity="0.9" />
                    <circle cx="60" cy="20" r="2" fill="#fb923c" opacity="0.8" />
                    <circle cx="40" cy="20" r="1.5" fill="#ef4444" opacity="0.7" />

                    {/* Metallic Rocket Body (Fairing, Stage 2, Grid fins, Engine bell) */}
                    <g transform="translate(120, 15)">
                      {/* Engine nozzle */}
                      <polygon points="0,2 6,3 6,7 0,8" fill="#475569" />
                      {/* Booster fuselage */}
                      <rect x="6" y="2" width="28" height="6" fill="#f8fafc" stroke="#334155" strokeWidth="0.5" />
                      {/* Interstage black ring */}
                      <rect x="22" y="2" width="2" height="6" fill="#0f172a" />
                      {/* Payload fairing nose cone */}
                      <path d="M 34,2 Q 44,5 44,5 Q 44,5 34,8 Z" fill="#e2e8f0" />
                      {/* RCS cold gas attitude puff (subtle) */}
                      <circle cx="36" cy="1" r="1" fill="#bae6fd" opacity="0.7" />
                      {/* Solar reflection glint */}
                      <line x1="12" y1="3" x2="32" y2="3" stroke="#ffffff" strokeWidth="0.7" opacity="0.8" />
                    </g>
                  </svg>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* ORBITAL SPACE STATION (ISS style with solar arrays & strobes)       */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'spaceStation' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <svg width="110" height="60" viewBox="0 0 110 60" className="overflow-visible drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]">
                    {/* Central Integrated Truss Spine */}
                    <rect x="15" y="28" width="80" height="4" fill="#94a3b8" rx="1" />

                    {/* Left Photovoltaic Solar Array Wings (Gold/Blue silicon texture) */}
                    <g fill="#1e3a8a" stroke="#d97706" strokeWidth="0.6">
                      <rect x="18" y="8" width="16" height="18" rx="1" />
                      <line x1="26" y1="8" x2="26" y2="26" stroke="#fbbf24" strokeWidth="0.5" />
                      <rect x="18" y="34" width="16" height="18" rx="1" />
                      <line x1="26" y1="34" x2="26" y2="52" stroke="#fbbf24" strokeWidth="0.5" />
                    </g>

                    {/* Right Photovoltaic Solar Array Wings */}
                    <g fill="#1e3a8a" stroke="#d97706" strokeWidth="0.6">
                      <rect x="76" y="8" width="16" height="18" rx="1" />
                      <line x1="84" y1="8" x2="84" y2="26" stroke="#fbbf24" strokeWidth="0.5" />
                      <rect x="76" y="34" width="16" height="18" rx="1" />
                      <line x1="84" y1="34" x2="84" y2="52" stroke="#fbbf24" strokeWidth="0.5" />
                    </g>

                    {/* Pressurized Habitat Modules (Zvezda / Destiny / Harmony cylinders) */}
                    <rect x="46" y="24" width="18" height="12" fill="#f1f5f9" stroke="#334155" strokeWidth="0.8" rx="3" />
                    <rect x="52" y="16" width="6" height="28" fill="#e2e8f0" stroke="#475569" strokeWidth="0.6" rx="2" />
                    {/* Cupola observation dome window */}
                    <circle cx="55" cy="30" r="2.5" fill="#0284c7" stroke="#ffffff" strokeWidth="0.5" />

                    {/* Radiator Panels (Thermal rejection white panels) */}
                    <rect x="38" y="26" width="5" height="8" fill="#f8fafc" opacity="0.9" />
                    <rect x="67" y="26" width="5" height="8" fill="#f8fafc" opacity="0.9" />

                    {/* Navigation Strobe Lights: Red (Port), Green (Starboard), White beacon */}
                    <circle cx="15" cy="30" r="2" fill="#ef4444" className="animate-ping" />
                    <circle cx="95" cy="30" r="2" fill="#10b981" className="animate-ping" />
                    <circle cx="55" cy="14" r="1.5" fill="#ffffff" className="animate-pulse" />
                  </svg>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* DEEP SPACE PROBE (VOYAGER STYLE WITH HIGH-GAIN DISH & RTG BOOM)     */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'probe' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <svg width="80" height="50" viewBox="0 0 80 50" className="overflow-visible drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                    {/* High-Gain Antenna (White/Gold Dish) */}
                    <ellipse cx="28" cy="25" rx="16" ry="12" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
                    <ellipse cx="28" cy="25" rx="14" ry="10" fill="#f1f5f9" />
                    {/* Subreflector feed horn */}
                    <polygon points="28,25 36,22 36,28" fill="#d97706" />
                    <line x1="28" y1="25" x2="36" y2="25" stroke="#ffffff" strokeWidth="0.8" />

                    {/* Instrument Bus */}
                    <rect x="18" y="20" width="10" height="10" fill="#cbd5e1" stroke="#475569" strokeWidth="0.6" rx="1" />

                    {/* Magnetometer Boom extending backwards */}
                    <line x1="18" y1="25" x2="2" y2="18" stroke="#94a3b8" strokeWidth="1" />
                    <circle cx="2" cy="18" r="2" fill="#f59e0b" />

                    {/* RTG Nuclear Power Unit with warm amber glow */}
                    <line x1="22" y1="30" x2="16" y2="44" stroke="#64748b" strokeWidth="1" />
                    <rect x="12" y="40" width="8" height="6" fill="#78350f" stroke="#f59e0b" strokeWidth="0.6" rx="1" />

                    {/* Telemetry data burst beacon */}
                    <circle cx="36" cy="25" r="1.5" fill="#38bdf8" className="animate-ping" />
                  </svg>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* SATELLITE (Drifting craft with solar arrays & specular solar flare)  */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'satellite' && (
                <div className="relative -translate-x-1/2 -translate-y-1/2">
                  <svg width="44" height="24" viewBox="0 0 44 24" className="overflow-visible">
                    {/* Solar panels */}
                    <rect x="2" y="8" width="12" height="8" fill="#1e40af" stroke="#60a5fa" strokeWidth="0.5" />
                    <rect x="30" y="8" width="12" height="8" fill="#1e40af" stroke="#60a5fa" strokeWidth="0.5" />
                    <line x1="14" y1="12" x2="30" y2="12" stroke="#94a3b8" strokeWidth="1" />
                    {/* Satellite Bus */}
                    <rect x="18" y="7" width="8" height="10" fill="#f8fafc" stroke="#475569" strokeWidth="0.5" rx="1" />
                    {/* Specular Iridium solar glint (flare) */}
                    <circle cx="22" cy="12" r="3" fill="#ffffff" className="animate-ping" />
                  </svg>
                </div>
              )}

              {/* ------------------------------------------------------------------- */}
              {/* UAP / EXOTIC RECON SCOUT (Realistic aerodynamic/torus craft)        */}
              {/* ------------------------------------------------------------------- */}
              {visitor.type === 'ufo' && (
                <div
                  className="relative -translate-x-1/2 -translate-y-1/2"
                  style={{ transform: `rotate(${visitor.rotation}deg)` }}
                >
                  <svg width="74" height="34" viewBox="0 0 74 34" className="overflow-visible drop-shadow-[0_0_16px_rgba(6,182,212,0.65)]">
                    <defs>
                      <radialGradient id="ufoAntigravity" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#67e8f9" />
                        <stop offset="45%" stopColor="#06b6d4" />
                        <stop offset="80%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="transparent" />
                      </radialGradient>
                    </defs>

                    {/* Antigravity Propulsion Distortion Ring */}
                    <ellipse cx="37" cy="22" rx="28" ry="6" fill="url(#ufoAntigravity)" opacity="0.75" />

                    {/* Smooth Obsidian-Metallic Disc Fuselage */}
                    <ellipse cx="37" cy="18" rx="26" ry="7" fill="#0f172a" stroke="#06b6d4" strokeWidth="0.8" />
                    <ellipse cx="37" cy="15" rx="14" ry="5" fill="#1e293b" stroke="#38bdf8" strokeWidth="0.6" />

                    {/* Pulsing Energy Beacons / Ventral Emitters */}
                    <circle cx="20" cy="20" r="1.5" fill="#a5f3fc" className="animate-pulse" />
                    <circle cx="37" cy="22" r="2" fill="#ffffff" className="animate-pulse" />
                    <circle cx="54" cy="20" r="1.5" fill="#a5f3fc" className="animate-pulse" />

                    {/* Specular Horizon Glint */}
                    <path d="M 22,17 Q 37,13 52,17" fill="none" stroke="#e0f2fe" strokeWidth="0.7" opacity="0.85" />
                  </svg>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
