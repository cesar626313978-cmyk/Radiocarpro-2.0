import React, { useEffect, useState, useMemo, useRef } from 'react';
import { RadioStation } from '../types/radio';
import { DriveAudioFile } from '../types/drive';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { googleDriveService } from '../services/googleDriveService';
import { teslaBackgroundService } from '../services/teslaBackgroundService';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { RealisticSpaceCosmos } from './RealisticSpaceCosmos';
import { motion, AnimatePresence } from 'motion/react';

interface CarModeViewProps {
  activeSource: 'radio' | 'drive';
  currentStation: RadioStation | null;
  currentDriveTrack: DriveAudioFile | null;
  isPlaying: boolean;
  playbackStatus?: string;
  onTogglePlay: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onExitCarMode: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onConnectDrive?: () => void;
  drivePlaylist?: DriveAudioFile[];
  onSelectDriveTrack?: (track: DriveAudioFile, index: number) => void;
}

// 6 Default High-Fidelity Cyber Driving Tracks matching Screenshot 2 exactly
const DEFAULT_CAR_TRACKS: DriveAudioFile[] = [
  {
    id: 'track-1',
    name: 'Nightcall Horizon.mp3',
    artist: 'Kavinsky & Cyberwave',
    album: 'Neon Drive OST',
    duration: 215, // 03:35
  },
  {
    id: 'track-2',
    name: 'Neon Supercharger.mp3',
    artist: 'AudioCar Synth Collective',
    album: 'Midnight Velocity',
    duration: 184, // 03:04
  },
  {
    id: 'track-3',
    name: 'Autopilot Coastline (Deep House Mix).mp3',
    artist: 'Solaris Wave',
    album: 'Sunset Highway',
    duration: 242, // 04:02
  },
  {
    id: 'track-4',
    name: 'Midnight Cruising 120km/h.mp3',
    artist: 'Aero Dynamics',
    album: 'Cyber Nightrun',
    duration: 198, // 03:18
  },
  {
    id: 'track-5',
    name: 'Cruisin Speed - Neon Lights Drive.mp3',
    artist: 'Electro Drive',
    album: 'Cyber Odyssey',
    duration: 230, // 03:50
  },
  {
    id: 'track-6',
    name: 'Starlight Highway 140km/h.mp3',
    artist: 'Cyberwave Syndicate',
    album: 'Hyperdrive',
    duration: 255, // 04:15
  },
];

export const CarModeView: React.FC<CarModeViewProps> = ({
  activeSource,
  currentStation,
  currentDriveTrack,
  isPlaying,
  playbackStatus = 'idle',
  onTogglePlay,
  onNext,
  onPrev,
  onExitCarMode,
  volume,
  onVolumeChange,
  onConnectDrive,
  drivePlaylist,
  onSelectDriveTrack,
}) => {
  // Navigation mode: 'player' (Screenshot 1) vs 'library' (Screenshot 2)
  const [currentView, setCurrentView] = useState<'player' | 'library'>('player');

  // Controls state: Mix (shuffle) & Loop (repeat)
  const [isMixActive, setIsMixActive] = useState<boolean>(true);
  const [isLoopActive, setIsLoopActive] = useState<boolean>(false);

  // Privacy Policy modal state
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  // Search filter query in Library view
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Local weather & time
  const [localTime, setLocalTime] = useState<string>('');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Audio coexistence tip state
  const [showCarAudioTip, setShowCarAudioTip] = useState<boolean>(false);

  // Drive authentication & playlist state
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(() => googleDriveService.hasToken());
  const [enginePlaylist, setEnginePlaylist] = useState<DriveAudioFile[]>(() => driveAudioEngine.getPlaylist());

  // High-precision playback timing & duration synchronized directly with real audio engine
  const [playbackCurrentTime, setPlaybackCurrentTime] = useState<number>(() => driveAudioEngine.getCurrentTime() || 0);
  const [playbackDuration, setPlaybackDuration] = useState<number>(() => driveAudioEngine.getDuration() || 0);
  const isScrubbingRef = useRef<boolean>(false);
  const orbRef = useRef<HTMLDivElement>(null);
  const [selectedDemoIndex, setSelectedDemoIndex] = useState<number>(1); // Index 1 is Neon Supercharger as in screenshot 2!

  // Full unified track list: user's real Drive songs if loaded, otherwise DEFAULT_CAR_TRACKS
  const allTracks = useMemo<DriveAudioFile[]>(() => {
    if (drivePlaylist && drivePlaylist.length > 0) return drivePlaylist;
    if (enginePlaylist && enginePlaylist.length > 0) return enginePlaylist;
    return DEFAULT_CAR_TRACKS;
  }, [drivePlaylist, enginePlaylist]);

  // Active track determination
  const activeTrack = useMemo<DriveAudioFile>(() => {
    if (currentDriveTrack) return currentDriveTrack;
    return allTracks[selectedDemoIndex] || allTracks[0];
  }, [currentDriveTrack, allTracks, selectedDemoIndex]);

  // Filtered tracks for Library view search
  const filteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return allTracks;
    const q = searchQuery.toLowerCase();
    return allTracks.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q))
    );
  }, [allTracks, searchQuery]);

  // Keep Drive token status updated
  useEffect(() => {
    setIsDriveConnected(googleDriveService.hasToken());
  }, []);

  // Listen to drive audio engine playlist updates
  useEffect(() => {
    const unsub = driveAudioEngine.onPlaylistChange(list => {
      setEnginePlaylist(list);
    });
    return unsub;
  }, []);

  // Sync time counter with driveAudioEngine when playing real Drive audio
  useEffect(() => {
    const unsub = driveAudioEngine.onTimeUpdate((time, dur) => {
      if (activeSource === 'drive' && !isScrubbingRef.current) {
        setPlaybackCurrentTime(time);
        if (dur > 0) {
          setPlaybackDuration(dur);
        }
      }
    });
    return unsub;
  }, [activeSource]);

  // Reset & sync when currentDriveTrack or source changes
  useEffect(() => {
    if (activeSource === 'drive') {
      const cur = driveAudioEngine.getCurrentTime();
      setPlaybackCurrentTime(cur);
      const dur = driveAudioEngine.getDuration();
      if (dur > 0) {
        setPlaybackDuration(dur);
      } else if (currentDriveTrack?.duration) {
        setPlaybackDuration(currentDriveTrack.duration);
      }
    }
  }, [currentDriveTrack, activeSource]);

  // Wake lock & fullscreen handler for car screen
  useEffect(() => {
    teslaBackgroundService.requestWakeLock();
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Clock update for "Tiempo Local"
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setLocalTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  // Simulated playback timer ONLY for offline demo tracks when real Drive or Radio engine is NOT active
  // CRITICAL: NEVER run simulation timer when real audio (Drive or Radio) is active to prevent conflicts and jumps
  useEffect(() => {
    if (activeSource === 'drive' || activeSource === 'radio') {
      return;
    }
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setPlaybackCurrentTime(prev => {
        const total = activeTrack?.duration || 184;
        if (prev >= total) {
          if (isLoopActive) return 0;
          if (onNext) onNext();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, activeTrack, isLoopActive, onNext, activeSource]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Compute effective duration & normalized progress ratio (0 to 1)
  const effectiveDuration = useMemo(() => {
    if (activeSource === 'drive') {
      if (playbackDuration > 0) return playbackDuration;
      if (currentDriveTrack?.duration && currentDriveTrack.duration > 0) return currentDriveTrack.duration;
    }
    if (activeTrack?.duration && activeTrack.duration > 0) return activeTrack.duration;
    return 184; // 03:04 default fallback if metadata not yet resolved
  }, [activeSource, playbackDuration, currentDriveTrack?.duration, activeTrack?.duration]);

  const progressRatio = useMemo(() => {
    if (effectiveDuration <= 0) return 0;
    return Math.min(1, Math.max(0, playbackCurrentTime / effectiveDuration));
  }, [playbackCurrentTime, effectiveDuration]);

  // 12 precision hour markers (each 30 degrees: 12:00, 1:00, 2:00 ... 11:00)
  const hourTicks = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = (i * 30 - 90) * (Math.PI / 180);
      const isCardinal = i % 3 === 0; // 12, 3, 6, 9
      const rInner = isCardinal ? 91.5 : 93.5;
      const rOuter = 95.5;
      return {
        hour: i === 0 ? 12 : i,
        x1: 100 + rInner * Math.cos(angle),
        y1: 100 + rInner * Math.sin(angle),
        x2: 100 + rOuter * Math.cos(angle),
        y2: 100 + rOuter * Math.sin(angle),
        isCardinal,
      };
    });
  }, []);

  // Moving leading tracer bead & lens flare at current audio progress
  const headPos = useMemo(() => {
    const angleDeg = progressRatio * 360;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const r = 95.5;
    return {
      x: 100 + r * Math.cos(angleRad),
      y: 100 + r * Math.sin(angleRad),
      angleDeg,
    };
  }, [progressRatio]);

  // Circular scrubber handling along the outer sphere perimeter
  const handleScrubAtPoint = (clientX: number, clientY: number) => {
    if (!orbRef.current) return;
    const rect = orbRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    const scrubRatio = Math.max(0, Math.min(1, deg / 360));
    const targetSec = scrubRatio * effectiveDuration;
    setPlaybackCurrentTime(targetSec);
    if (activeSource === 'drive') {
      driveAudioEngine.seek(targetSec);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!orbRef.current) return;
    const rect = orbRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radiusPx = rect.width / 2;
    // Engage scrubber when clicking/tapping the perimeter band (outer 25% of sphere)
    if (dist >= radiusPx * 0.72 && dist <= radiusPx * 1.08) {
      isScrubbingRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      handleScrubAtPoint(e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current) {
      handleScrubAtPoint(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Track name cleanup for display
  const displayTitle = useMemo(() => {
    if (!isDriveConnected && activeSource !== 'drive' && !isPlaying) {
      return 'Desconectado de Drive';
    }
    if (activeSource === 'radio' && currentStation) {
      return currentStation.name;
    }
    return activeTrack?.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg)$/i, '') || 'Desconectado de Drive';
  }, [isDriveConnected, activeSource, isPlaying, currentStation, activeTrack]);

  const displaySubtitle = useMemo(() => {
    if (!isDriveConnected && activeSource !== 'drive' && !isPlaying) {
      return 'Pulsa el botón naranja "Conectar Drive"';
    }
    if (activeSource === 'radio' && currentStation) {
      return `${currentStation.country} • ${currentStation.genre || 'Radio en Directo'}`;
    }
    return activeTrack?.artist || 'AudioCar Synth Collective';
  }, [isDriveConnected, activeSource, isPlaying, currentStation, activeTrack]);

  // Toggle Fullscreen
  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed in CarMode:', err);
    }
  };

  // Play a specific track from the Biblioteca list
  const handleSelectTrack = (track: DriveAudioFile, index: number) => {
    setSelectedDemoIndex(index);
    setPlaybackCurrentTime(0);
    if (track.duration) {
      setPlaybackDuration(track.duration);
    }

    if (onSelectDriveTrack) {
      onSelectDriveTrack(track, index);
    } else {
      const token = googleDriveService.getToken();
      driveAudioEngine.playTrack(track, token || undefined);
      if (!isPlaying) {
        onTogglePlay();
      }
    }
  };

  // Volume slider handlers
  const handleVolumeDown = () => {
    onVolumeChange(Math.max(0, volume - 0.05));
  };

  const handleVolumeUp = () => {
    onVolumeChange(Math.min(1, volume + 0.05));
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#030308] text-white flex flex-col items-center justify-center overflow-hidden select-none font-sans h-full max-h-screen">
      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />

      {/* Deep Realistic Space Cosmos Background (Planets, Moon, Comets, Rockets, Stations, UFOs) */}
      <RealisticSpaceCosmos />

      {/* Top Floating Controls Bar: Fullscreen & Exit Car Mode */}
      <div className="absolute top-3 left-4 right-4 z-40 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${currentView === 'library' ? 'bg-[#4edea3]' : 'bg-cyan-400'} animate-pulse`} />
          <span className="text-[10px] sm:text-xs font-mono font-bold tracking-widest text-cyan-300/80 uppercase">
            MODO COCHE HUD • {currentView === 'library' ? 'BIBLIOTECA PISTAS' : 'REPRODUCTOR'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="px-2.5 sm:px-3 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/20 text-white font-mono text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer backdrop-blur-md transition-all"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa Coche'}
          >
            <span className="material-symbols-outlined text-sm sm:text-base text-cyan-400">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
            <span className="hidden sm:inline">{isFullscreen ? 'VENTANA' : 'PANTALLA TOTAL'}</span>
          </button>

          <button
            type="button"
            onClick={onExitCarMode}
            className="px-2.5 sm:px-3.5 py-1 rounded-full bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-200 font-mono text-[10px] sm:text-xs uppercase tracking-wider flex items-center gap-1 cursor-pointer backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.6)] transition-all"
            title="Salir del Modo Coche"
          >
            <span className="material-symbols-outlined text-sm sm:text-base text-red-400">power_settings_new</span>
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN SPHERICAL COCKPIT ORB (100% FAITHFUL TO SCREENSHOTS 1 & 2)           */}
      {/* ========================================================================= */}
      <div className="relative flex items-center justify-center p-2 z-20">
        {/* Exterior Neon LED Effects: Halo, Glow, Accent Arc strips & Moving Lens Flare */}
        <div
          ref={orbRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative rounded-full flex items-center justify-center transition-all duration-700 select-none ${
            currentView === 'library'
              ? 'shadow-[0_0_55px_rgba(78,222,163,0.65),0_0_110px_rgba(34,197,94,0.35)]'
              : 'shadow-[0_0_60px_rgba(124,58,237,0.45),0_0_110px_rgba(99,102,241,0.25)]'
          }`}
          style={{
            width: 'min(92vw, 90vh, 580px)',
            height: 'min(92vw, 90vh, 580px)',
            touchAction: 'none',
          }}
          title="Progreso de audición sincronizado (12:00 a 00:00). Puedes pulsar o arrastrar para saltar a cualquier punto."
        >
          {/* Outer Ring 1: Diffused Colored Aura */}
          <div
            className={`absolute -inset-2 rounded-full border pointer-events-none transition-all duration-700 ${
              currentView === 'library'
                ? 'border-[#4edea3]/40 bg-emerald-500/5'
                : 'border-purple-500/30 bg-purple-500/5'
            } blur-[1px]`}
          />

          {/* Outer Ring 2: Solid Neon Border (Cyan/Blue in Player, Emerald Green in Library) */}
          <div
            className={`absolute inset-0 rounded-full border-2 pointer-events-none transition-all duration-500 ${
              currentView === 'library'
                ? 'border-[#4edea3] shadow-[inset_0_0_20px_rgba(78,222,163,0.3)]'
                : 'border-[#38bdf8] shadow-[inset_0_0_20px_rgba(56,189,248,0.25)]'
            }`}
          />

          {/* Outer Ring 3: Dynamic Audio Progression & Cockpit Chronograph SVG Ring */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none rounded-full overflow-visible z-20"
            viewBox="0 0 200 200"
          >
            <defs>
              {/* Cyan to Violet electric gradient for player mode */}
              <linearGradient id="orbProgressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5ff" />
                <stop offset="35%" stopColor="#38bdf8" />
                <stop offset="70%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>

              {/* Emerald gradient for library mode */}
              <linearGradient id="orbProgressGradLib" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4edea3" />
                <stop offset="50%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>

              {/* Atmospheric neon bloom filter */}
              <filter id="orbNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur1" />
                <feGaussianBlur stdDeviation="1.5" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur1" />
                  <feMergeNode in="blur2" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Head Flare Specular Bloom */}
              <filter id="headFlareBloom" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Inactive Track: Subtle Background Rim */}
            <circle
              cx="100"
              cy="100"
              r="95.5"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="2.5"
            />

            {/* Automotive Chronometer Hour Ticks (Every 30° matching 12, 1, 2... 11 o'clock) */}
            {hourTicks.map(tick => (
              <line
                key={`tick-${tick.hour}`}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke={
                  tick.isCardinal
                    ? currentView === 'library'
                      ? 'rgba(78,222,163,0.7)'
                      : 'rgba(56,189,248,0.7)'
                    : 'rgba(255,255,255,0.2)'
                }
                strokeWidth={tick.isCardinal ? 1.5 : 0.8}
                strokeLinecap="round"
              />
            ))}

            {/* 12:00 / 00:00 START & FINISH APEX INDICATOR */}
            <polygon
              points="97,1.5 103,1.5 100,6"
              fill={currentView === 'library' ? '#4edea3' : '#38bdf8'}
              className="drop-shadow-[0_0_6px_#38bdf8]"
            />
            <text
              x="100"
              y="11.5"
              textAnchor="middle"
              fill={currentView === 'library' ? '#4edea3' : '#38bdf8'}
              fontSize="3.8"
              fontFamily="monospace"
              fontWeight="bold"
              letterSpacing="0.2"
              opacity="0.85"
            >
              12:00
            </text>

            {/* ACTIVE ILLUMINATED PROGRESSION RING (STARTS AT 12:00, ROTATES -90 DEG, ADVANCES CLOCKWISE) */}
            {activeSource === 'drive' || !isPlaying ? (
              <g transform="rotate(-90 100 100)">
                {/* 1. Broad Diffused Glow Aura */}
                <circle
                  cx="100"
                  cy="100"
                  r="95.5"
                  fill="none"
                  stroke={currentView === 'library' ? 'url(#orbProgressGradLib)' : 'url(#orbProgressGrad)'}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 95.5}
                  strokeDashoffset={(2 * Math.PI * 95.5) * (1 - progressRatio)}
                  opacity="0.5"
                  filter="url(#orbNeonGlow)"
                  className="transition-[stroke-dashoffset] duration-150 ease-out"
                />

                {/* 2. Intense Solid Neon Core */}
                <circle
                  cx="100"
                  cy="100"
                  r="95.5"
                  fill="none"
                  stroke={currentView === 'library' ? 'url(#orbProgressGradLib)' : 'url(#orbProgressGrad)'}
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 95.5}
                  strokeDashoffset={(2 * Math.PI * 95.5) * (1 - progressRatio)}
                  filter="url(#orbNeonGlow)"
                  className="transition-[stroke-dashoffset] duration-150 ease-out"
                />

                {/* 3. Ultra-Bright White Specular Core Filament */}
                <circle
                  cx="100"
                  cy="100"
                  r="95.5"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 95.5}
                  strokeDashoffset={(2 * Math.PI * 95.5) * (1 - progressRatio)}
                  opacity="0.9"
                  className="transition-[stroke-dashoffset] duration-150 ease-out"
                />
              </g>
            ) : null}

            {/* LEADING HEAD TRACER: Luminescent jewel bead & flare moving with audio progression */}
            {progressRatio > 0 && (
              <g>
                {/* Horizontal Flare beam wing */}
                <line
                  x1={headPos.x - 12}
                  y1={headPos.y}
                  x2={headPos.x + 12}
                  y2={headPos.y}
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  opacity="0.8"
                  filter="url(#headFlareBloom)"
                />
                {/* Outer radial glow halo */}
                <circle
                  cx={headPos.x}
                  cy={headPos.y}
                  r="6.5"
                  fill={currentView === 'library' ? '#4edea3' : '#38bdf8'}
                  opacity="0.45"
                  className={isPlaying ? 'animate-pulse' : ''}
                />
                {/* Secondary bright core bead */}
                <circle
                  cx={headPos.x}
                  cy={headPos.y}
                  r="3.5"
                  fill={currentView === 'library' ? '#a7f3d0' : '#bae6fd'}
                  filter="url(#headFlareBloom)"
                />
                {/* Intense white center point */}
                <circle
                  cx={headPos.x}
                  cy={headPos.y}
                  r="1.8"
                  fill="#ffffff"
                />
              </g>
            )}
          </svg>

          {/* Exterior LED Accent Arc Strips (Curved neon light strips on outer perimeter) */}
          {currentView === 'player' ? (
            <>
              {/* Lavender / Violet bottom-right arc */}
              <div
                className="absolute -bottom-1 -right-1 w-24 h-24 rounded-full border-b-3 border-r-3 border-[#c084fc] pointer-events-none blur-[0.5px]"
                style={{ filter: 'drop-shadow(0 0 8px #c084fc)' }}
              />
              {/* Electric Cyan top-left arc */}
              <div
                className="absolute -top-1 -left-1 w-28 h-28 rounded-full border-t-3 border-l-3 border-[#38bdf8] pointer-events-none blur-[0.5px]"
                style={{ filter: 'drop-shadow(0 0 8px #38bdf8)' }}
              />
            </>
          ) : (
            <>
              {/* Vivid Emerald left arc */}
              <div
                className="absolute -top-1 -left-1 w-32 h-32 rounded-full border-t-3 border-l-3 border-[#4edea3] pointer-events-none blur-[0.5px]"
                style={{ filter: 'drop-shadow(0 0 10px #4edea3)' }}
              />
              {/* Neon Green bottom arc */}
              <div
                className="absolute -bottom-1 -left-1 w-24 h-24 rounded-full border-b-3 border-l-3 border-[#22c55e] pointer-events-none blur-[0.5px]"
                style={{ filter: 'drop-shadow(0 0 8px #22c55e)' }}
              />
            </>
          )}

          {/* Inner Spherical Container (Dark interior with 3D Globe wireframe grid) */}
          <div className="relative w-full h-full rounded-full bg-[#030712] overflow-hidden flex flex-col items-center justify-center p-4 sm:p-6 text-center">
            {/* 3D Spherical Globe Wireframe Grid (Meridians & Latitudes) */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
              {/* Latitudes: horizontal curved ellipses */}
              <div className="absolute top-[18%] left-[8%] right-[8%] h-[64%] border border-cyan-400 rounded-full" />
              <div className="absolute top-[32%] left-[3%] right-[3%] h-[36%] border border-cyan-400 rounded-full" />
              <div className="absolute top-[48%] left-0 right-0 h-[4%] border-t border-b border-cyan-400" />

              {/* Longitudes: vertical meridian arcs */}
              <div className="absolute top-[3%] bottom-[3%] left-[18%] right-[18%] border border-cyan-400 rounded-full" />
              <div className="absolute top-[1%] bottom-[1%] left-[34%] right-[34%] border border-cyan-400 rounded-full" />
              <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-cyan-400/60" />
            </div>

            {/* Inner subtle vignette */}
            <div className="absolute inset-0 bg-radial from-transparent via-[#030712]/40 to-[#030712]/95 pointer-events-none" />

            {/* ============================================================== */}
            {/* VIEW 1: REPRODUCTOR CENTRAL (100% MATCH TO SCREENSHOT 1)        */}
            {/* ============================================================== */}
            {currentView === 'player' ? (
              <motion.div
                key="player-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="relative z-10 w-full h-full flex flex-col items-center justify-between py-2 sm:py-3.5"
              >
                {/* 1. TOP ORANGE PILL: Conectar Drive */}
                <button
                  type="button"
                  onClick={() => {
                    if (onConnectDrive) {
                      onConnectDrive();
                    } else {
                      window.location.reload();
                    }
                  }}
                  className="group relative flex items-center justify-between gap-2.5 px-4 sm:px-5 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[#d97706] via-[#ea580c] to-[#b45309] border border-amber-300/80 shadow-[0_0_24px_rgba(245,158,11,0.55)] hover:shadow-[0_0_30px_rgba(245,158,11,0.75)] hover:scale-102 active:scale-98 transition-all cursor-pointer"
                  title="Conectar o sincronizar Google Drive"
                >
                  <div className="flex items-center gap-1.5 text-white font-bold text-xs sm:text-sm tracking-wide">
                    <span className="material-symbols-outlined text-base sm:text-lg text-amber-100">hard_drive</span>
                    <span>{isDriveConnected ? 'Google Drive' : 'Conectar Drive'}</span>
                  </div>

                  <span
                    className={`text-[9px] sm:text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${
                      isDriveConnected
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-400/50'
                        : 'bg-black/40 text-amber-200 border border-amber-400/40'
                    }`}
                  >
                    {isDriveConnected ? 'CONECTADO' : 'DESCONECTADO'}
                  </span>
                </button>

                {/* 2. STATUS BADGES ROW: [ AUDIO EN ESPERA ]  [ Tiempo Local ]  [ Audio Coche ] */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 text-[10px] sm:text-[11px] font-mono tracking-wider flex-wrap justify-center">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#051a26]/90 border border-cyan-500/30 text-cyan-200">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isPlaying ? 'bg-[#4edea3] animate-pulse' : 'bg-[#06b6d4]'
                      }`}
                    />
                    <span className="font-bold uppercase">
                      {playbackStatus === 'buffering'
                        ? 'BÚFER...'
                        : isPlaying
                        ? 'REPRODUCIENDO'
                        : 'AUDIO EN ESPERA'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#051a26]/90 border border-cyan-500/30 text-cyan-200">
                    <span>🌤️</span>
                    <span className="font-bold">Tiempo Local</span>
                    {localTime && <span className="text-cyan-400 font-semibold">• {localTime}</span>}
                  </div>

                  {/* Audio Coche integration advice button */}
                  <button
                    type="button"
                    onClick={() => setShowCarAudioTip(true)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1e1503]/90 border border-amber-500/50 text-amber-200 hover:border-amber-300 hover:text-white transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.25)]"
                    title="Consejo de audio si la radio del coche suena a la vez"
                  >
                    <span className="material-symbols-outlined text-xs text-amber-400">volume_up</span>
                    <span className="font-bold">Audio Coche</span>
                  </button>
                </div>

                {/* 3. CENTRAL TRACK TITLE & SUBTITLE */}
                <div className="w-full px-4 max-w-sm sm:max-w-md my-auto">
                  <h1
                    className="text-lg sm:text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] truncate"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </h1>
                  <p
                    className="text-xs sm:text-sm font-semibold text-amber-300 mt-1 truncate drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
                    title={displaySubtitle}
                  >
                    {displaySubtitle}
                  </p>
                </div>

                {/* 4. TRANSPORT 5-BUTTON DECK */}
                <div className="flex items-center justify-center gap-2 sm:gap-2.5 w-full px-2">
                  {/* MIX / Shuffle Button */}
                  <button
                    type="button"
                    onClick={() => setIsMixActive(!isMixActive)}
                    className={`w-11 sm:w-13 h-14 sm:h-16 rounded-xl flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer ${
                      isMixActive
                        ? 'bg-[#082032] border-2 border-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.5)]'
                        : 'bg-[#051522]/80 border border-cyan-500/30 opacity-70 hover:opacity-100'
                    }`}
                    title="Reproducción aleatoria (MIX)"
                  >
                    <span className="text-[9px] font-mono font-bold text-cyan-300">MIX</span>
                    <span className="material-symbols-outlined text-lg sm:text-xl text-cyan-200">shuffle</span>
                    <span
                      className={`w-5 h-[2px] rounded-full ${
                        isMixActive ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-transparent'
                      }`}
                    />
                  </button>

                  {/* PREV Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setPlaybackCurrentTime(0);
                      if (onPrev) {
                        onPrev();
                      } else {
                        setSelectedDemoIndex(prev => (prev - 1 + allTracks.length) % allTracks.length);
                      }
                    }}
                    className="w-11 sm:w-13 h-14 sm:h-16 rounded-xl bg-[#051522]/90 border border-cyan-500/40 hover:border-cyan-400 flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:scale-95"
                    title="Pista anterior"
                  >
                    <span className="text-[9px] font-mono font-bold text-cyan-300">PREV</span>
                    <span className="material-symbols-outlined text-lg sm:text-xl text-cyan-100">skip_previous</span>
                    <span className="w-5 h-[2px] bg-transparent" />
                  </button>

                  {/* PLAY / PAUSE Button (Center - Larger with Amber/Gold Glow) */}
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="w-14 sm:w-17 h-16 sm:h-19 rounded-2xl bg-gradient-to-b from-[#1c1917]/95 via-[#0c0a09]/95 to-[#000000] border-2 border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.5),inset_0_1px_3px_rgba(255,255,255,0.3)] flex flex-col items-center justify-between p-1.5 sm:p-2 transition-all hover:scale-103 active:scale-95 cursor-pointer"
                    title={isPlaying ? 'Pausa' : 'Reproducir'}
                  >
                    <span className="text-[9px] sm:text-[10px] font-mono font-black text-amber-300 uppercase tracking-wider">
                      {isPlaying ? 'PAUSE' : 'PLAY'}
                    </span>
                    <span className="material-symbols-outlined text-2xl sm:text-3xl text-cyan-300 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]">
                      {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                    <span className="w-7 h-[3px] rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                  </button>

                  {/* NEXT Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setPlaybackCurrentTime(0);
                      if (onNext) {
                        onNext();
                      } else {
                        setSelectedDemoIndex(prev => (prev + 1) % allTracks.length);
                      }
                    }}
                    className="w-11 sm:w-13 h-14 sm:h-16 rounded-xl bg-[#051522]/90 border border-cyan-500/40 hover:border-cyan-400 flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.5)] active:scale-95"
                    title="Pista siguiente"
                  >
                    <span className="text-[9px] font-mono font-bold text-cyan-300">NEXT</span>
                    <span className="material-symbols-outlined text-lg sm:text-xl text-cyan-100">skip_next</span>
                    <span className="w-5 h-[2px] bg-transparent" />
                  </button>

                  {/* LOOP / Repeat Button */}
                  <button
                    type="button"
                    onClick={() => setIsLoopActive(!isLoopActive)}
                    className={`w-11 sm:w-13 h-14 sm:h-16 rounded-xl flex flex-col items-center justify-between p-1.5 transition-all cursor-pointer ${
                      isLoopActive
                        ? 'bg-[#082032] border-2 border-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.5)]'
                        : 'bg-[#051522]/80 border border-cyan-500/30 opacity-70 hover:opacity-100'
                    }`}
                    title="Repetir pista (LOOP)"
                  >
                    <span className="text-[9px] font-mono font-bold text-cyan-300">LOOP</span>
                    <span className="material-symbols-outlined text-lg sm:text-xl text-cyan-200">repeat</span>
                    <span
                      className={`w-5 h-[2px] rounded-full ${
                        isLoopActive ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' : 'bg-transparent'
                      }`}
                    />
                  </button>
                </div>

                {/* 5. MONOSPACE DIGITAL TIME COUNTER */}
                <div 
                  className="text-cyan-300 font-mono tracking-widest text-xs sm:text-sm font-bold drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] select-none"
                  title="Progreso de audición sincronizado con el archivo de audio"
                >
                  {activeSource === 'radio' ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>EN DIRECTO</span>
                      <span className="text-cyan-500 mx-1">•</span>
                      <span className="text-cyan-300">STREAMING</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-cyan-200">{formatTime(playbackCurrentTime)}</span>
                      <span className="text-cyan-500 mx-1.5">/</span>
                      <span className="text-cyan-400">{formatTime(effectiveDuration)}</span>
                    </>
                  )}
                </div>

                {/* 6. PRIVACY BUTTON (Exclusive: user requested omitting coffee button) */}
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1 rounded-full bg-[#051b29]/80 hover:bg-[#07283c] border border-cyan-500/40 hover:border-cyan-400 text-cyan-200 hover:text-white text-[11px] sm:text-xs font-bold shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm text-cyan-400">verified_user</span>
                    <span>Privacidad</span>
                  </button>
                </div>

                {/* 7. VOLUME SLIDER POD */}
                <div className="w-full max-w-[270px] sm:max-w-xs flex items-center justify-between gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full bg-[#04141f]/90 border border-cyan-500/40 shadow-[inset_0_1px_4px_rgba(0,0,0,0.8)]">
                  {/* Speaker Mute/Unmute */}
                  <button
                    type="button"
                    onClick={() => onVolumeChange(volume === 0 ? 0.6 : 0)}
                    className="text-cyan-300 hover:text-white transition-colors cursor-pointer"
                    title={volume === 0 ? 'Activar sonido' : 'Silenciar'}
                  >
                    <span className="material-symbols-outlined text-base sm:text-lg">
                      {volume === 0 ? 'volume_off' : 'volume_up'}
                    </span>
                  </button>

                  {/* Minus button */}
                  <button
                    type="button"
                    onClick={handleVolumeDown}
                    className="w-5 h-5 rounded-full bg-[#072436] hover:bg-[#093550] text-cyan-200 flex items-center justify-center font-bold text-xs cursor-pointer border border-cyan-500/30 transition-all"
                  >
                    −
                  </button>

                  {/* Range Slider */}
                  <div className="relative flex-1 flex items-center py-1">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={e => onVolumeChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-[#030d14] rounded-full appearance-none cursor-pointer accent-[#22d3ee] border border-cyan-500/20"
                    />
                  </div>

                  {/* Plus button */}
                  <button
                    type="button"
                    onClick={handleVolumeUp}
                    className="w-5 h-5 rounded-full bg-[#072436] hover:bg-[#093550] text-cyan-200 flex items-center justify-center font-bold text-xs cursor-pointer border border-cyan-500/30 transition-all"
                  >
                    +
                  </button>

                  {/* Percentage */}
                  <span className="text-[10px] sm:text-xs font-mono font-bold text-cyan-300 w-7 text-right">
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* 8. BOTTOM "PISTAS (6)" BUTTON */}
                <button
                  type="button"
                  onClick={() => setCurrentView('library')}
                  className="flex items-center gap-2 px-5 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#041a27]/90 hover:bg-[#06263a] border border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.45)] hover:shadow-[0_0_28px_rgba(6,182,212,0.7)] text-cyan-200 hover:text-white font-bold text-xs sm:text-sm tracking-wider uppercase transition-all cursor-pointer"
                  title="Abrir Biblioteca de Pistas de Audio"
                >
                  <span className="material-symbols-outlined text-base sm:text-lg text-cyan-300">
                    radio_button_checked
                  </span>
                  <span>Pistas ({allTracks.length})</span>
                </button>
              </motion.div>
            ) : (
              /* ============================================================== */
              /* VIEW 2: BIBLIOTECA (100% MATCH TO SCREENSHOT 2)                */
              /* ============================================================== */
              <motion.div
                key="library-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="relative z-10 w-full h-full flex flex-col items-center justify-between py-2 sm:py-3.5"
              >
                {/* 1. HEADER: BIBLIOTECA */}
                <div className="w-full text-center shrink-0">
                  <h2 className="text-xs sm:text-sm font-black tracking-[0.25em] text-white uppercase drop-shadow-[0_0_6px_rgba(255,255,255,0.4)]">
                    BIBLIOTECA
                  </h2>
                </div>

                {/* 2. SEARCH INPUT: Buscar canción o artista... */}
                <div className="w-full max-w-[320px] sm:max-w-sm shrink-0 px-2 mt-1">
                  <div className="relative flex items-center w-full rounded-full bg-black/40 border border-cyan-500/40 hover:border-cyan-400 focus-within:border-cyan-300 px-3.5 py-1.5 transition-all shadow-[inset_0_1px_4px_rgba(0,0,0,0.8)]">
                    <span className="material-symbols-outlined text-base text-cyan-400/80 mr-2">search</span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Buscar canción o artista..."
                      className="w-full bg-transparent text-white text-xs placeholder-gray-400/70 focus:outline-none font-sans"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-gray-400 hover:text-white text-xs ml-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. TRACKLIST STACK (Custom slim scrollbar on right as in screenshot 2) */}
                <div className="flex-1 w-full max-w-[340px] sm:max-w-[380px] my-1 sm:my-2 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-cyan-500 scrollbar-track-transparent">
                  {filteredTracks.map((track, idx) => {
                    const isSelected = activeTrack?.id === track.id;
                    const durationStr = formatTime(track.duration || 184);
                    const cleanName = track.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg)$/i, '');

                    return (
                      <div
                        key={track.id || idx}
                        onClick={() => handleSelectTrack(track, idx)}
                        className={`group relative flex items-center justify-between p-2 sm:p-2.5 rounded-xl cursor-pointer transition-all text-left ${
                          isSelected
                            ? 'bg-[#062436]/90 border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                            : 'bg-[#041421]/60 hover:bg-[#072436]/70 border border-cyan-500/20 hover:border-cyan-500/50'
                        }`}
                      >
                        {/* Left: Number & Track details */}
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <span className="text-[11px] sm:text-xs font-mono text-gray-400 w-3 text-right shrink-0">
                            {idx + 1}
                          </span>

                          <div className="min-w-0 flex-1">
                            <h3
                              className={`text-xs sm:text-sm font-bold tracking-tight truncate ${
                                isSelected ? 'text-white' : 'text-gray-200 group-hover:text-white'
                              }`}
                            >
                              {cleanName}
                            </h3>
                            <p className="text-[10px] sm:text-[11px] text-cyan-400 truncate mt-0.5">
                              {track.artist || 'Google Drive Audio'}
                            </p>
                          </div>
                        </div>

                        {/* Right: Duration */}
                        <span className="text-[10px] sm:text-xs font-mono text-gray-400 ml-2 shrink-0">
                          {durationStr}
                        </span>
                      </div>
                    );
                  })}

                  {filteredTracks.length === 0 && (
                    <div className="py-8 text-center text-xs text-gray-400">
                      No se encontraron canciones para "{searchQuery}"
                    </div>
                  )}
                </div>

                {/* 4. BOTTOM BUTTON: [ 🌐 Volver al Reproductor Central ] */}
                <button
                  type="button"
                  onClick={() => setCurrentView('player')}
                  className="flex items-center gap-2 px-5 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#041e2e]/90 hover:bg-[#072f48] border border-cyan-400 shadow-[0_0_18px_rgba(6,182,212,0.4)] hover:shadow-[0_0_24px_rgba(6,182,212,0.6)] text-cyan-200 hover:text-white font-bold text-xs sm:text-sm tracking-wide uppercase transition-all cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-base sm:text-lg text-cyan-300">public</span>
                  <span>Volver al Reproductor Central</span>
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Audio coexistence tip dialog */}
      {showCarAudioTip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121212] border-2 border-amber-400 max-w-md w-full p-5 sm:p-6 text-left shadow-[0_0_40px_rgba(245,158,11,0.3)] rounded-lg">
            <div className="flex items-center justify-between border-b border-amber-500/30 pb-3 mb-4">
              <div className="flex items-center gap-2 text-amber-400">
                <span className="material-symbols-outlined text-xl">volume_up</span>
                <h3 className="font-black text-sm uppercase tracking-wide text-white">Audio en el Coche</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCarAudioTip(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="font-mono text-xs text-[#d1d5db] flex flex-col gap-3">
              <p className="text-amber-300 font-bold">
                ¿Se escucha la radio propia del coche al mismo tiempo que esta emisora?
              </p>
              <p className="text-[11px] leading-relaxed text-[#bbcabf]">
                Los coches cuentan con un sintonizador físico de radio FM/DAB independiente del navegador web. Por seguridad del vehículo, los navegadores no pueden apagar el chip de radio física, por lo que el sistema mezcla ambos sonidos en los altavoces.
              </p>

              <div className="bg-black/60 border border-amber-500/40 p-3 flex flex-col gap-2 rounded">
                <div className="text-[#4edea3] font-bold text-[11px] uppercase flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Solución rápida (1 segundo):
                </div>
                <ul className="list-disc list-inside space-y-1.5 text-[11px] text-[#e5e5e5]">
                  <li>
                    Pulsa la <strong className="text-white">rueda izquierda del volante</strong> (o botón de mute/pausa del volante) una vez para pausar la radio del coche.
                  </li>
                  <li>
                    O toca el <strong className="text-white">mini-reproductor en la pantalla del coche</strong> y pulsa Pausa en la radio FM nativa.
                  </li>
                </ul>
              </div>

              <p className="text-[10px] text-[#86948a] leading-relaxed">
                Una vez pausada la radio nativa, esta aplicación tomará el control total del audio de tu coche con ecualización de alta fidelidad.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCarAudioTip(false)}
              className="mt-5 w-full py-2 bg-amber-400 text-black font-mono text-xs font-black uppercase hover:bg-amber-300 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] rounded"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
