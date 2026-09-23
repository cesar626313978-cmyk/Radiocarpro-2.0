import React, { useEffect, useState } from 'react';
import { RadioStation } from '../types/radio';
import { DriveAudioFile } from '../types/drive';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { motion } from 'motion/react';

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
}

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
}) => {
  const isDrive = activeSource === 'drive';

  // Rich multi-layered realistic starfield
  const [stars] = useState(() =>
    Array.from({ length: 180 }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      duration: Math.random() * 3 + 1.5,
      delay: Math.random() * 2,
      color: Math.random() > 0.8 ? '#93c5fd' : Math.random() > 0.6 ? '#fed7aa' : '#ffffff',
    }))
  );

  const [comets] = useState(() =>
    Array.from({ length: 4 }).map((_, i) => ({
      top: Math.random() * 70,
      left: Math.random() * 80,
      duration: Math.random() * 4 + 3.5,
      delay: i * 2.5 + Math.random() * 2,
    }))
  );

  const [equalizerLevels, setEqualizerLevels] = useState<number[]>([40, 65, 30, 85, 50, 90, 45, 70, 35, 80, 55, 95]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [decorProgress, setDecorProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  useEffect(() => {
    if (!isDrive) return;
    const unsubscribe = driveAudioEngine.onTimeUpdate((time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });
    return () => unsubscribe();
  }, [isDrive]);

  useEffect(() => {
    if (isDrive || !isPlaying) return;
    const interval = setInterval(() => {
      setDecorProgress(prev => (prev >= 100 ? 0 : prev + 0.4));
    }, 200);
    return () => clearInterval(interval);
  }, [isDrive, isPlaying]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    if (!isPlaying || playbackStatus !== 'playing') return;
    const interval = setInterval(() => {
      setEqualizerLevels(
        Array.from({ length: 12 }).map(() => Math.floor(Math.random() * 75) + 25)
      );
    }, 120);
    return () => clearInterval(interval);
  }, [isPlaying, playbackStatus]);

  return (
    <div className="fixed inset-0 z-50 bg-[#010104] text-white flex flex-col justify-between overflow-hidden select-none font-mono-tech">
      {/* Immersive Space Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-10 left-1/4 w-[800px] h-[800px] bg-gradient-to-br from-indigo-950/20 via-purple-950/15 to-transparent rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-[700px] h-[700px] bg-gradient-to-tr from-cyan-950/20 via-blue-950/15 to-transparent rounded-full blur-[120px] pointer-events-none" />

        {stars.map((star, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              backgroundColor: star.color,
              boxShadow: star.size > 1.8 ? `0 0 ${star.size * 2.5}px ${star.color}` : 'none',
            }}
            animate={{
              opacity: [star.opacity * 0.2, star.opacity, star.opacity * 0.2],
              scale: [0.8, 1.3, 0.8],
            }}
            transition={{
              duration: star.duration,
              repeat: Infinity,
              delay: star.delay,
              ease: 'easeInOut',
            }}
          />
        ))}

        {comets.map((comet, i) => (
          <motion.div
            key={`comet-${i}`}
            className="absolute h-[1.5px] w-[140px] bg-gradient-to-r from-transparent via-white to-transparent rotate-[-35deg]"
            style={{
              top: `${comet.top}%`,
              left: `${comet.left}%`,
            }}
            animate={{
              x: ['-150vw', '150vw'],
              y: ['-50vh', '50vh'],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: comet.duration,
              repeat: Infinity,
              delay: comet.delay,
              ease: 'linear',
              repeatDelay: 4,
            }}
          />
        ))}
      </div>

      {/* Top Header Bar */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-white/10 bg-black/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-[#4edea3] animate-pulse" />
          <span className="text-xs sm:text-sm font-bold tracking-widest text-[#4edea3] uppercase">
            MODO COCHE HUD • {isDrive ? 'GOOGLE DRIVE /mimusica' : 'RADIO EN VIVO'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <motion.button
            type="button"
            onClick={handleToggleFullscreen}
            whileTap={{ scale: 0.95 }}
            className="px-3.5 sm:px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer backdrop-blur-lg transition-all"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa Tesla 1920x1200'}
          >
            <span className="material-symbols-outlined text-base text-[#4edea3]">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
            <span className="hidden sm:inline">
              {isFullscreen ? 'VENTANA' : 'PANTALLA TOTAL'}
            </span>
          </motion.button>

          <motion.button
            type="button"
            onClick={onExitCarMode}
            whileTap={{ scale: 0.95, y: 1 }}
            className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-white/10 via-white/5 to-white/10 hover:from-white/20 hover:to-white/15 border border-white/25 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer backdrop-blur-lg shadow-[0_4px_15px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] transition-all hover:border-[#4edea3]/60"
          >
            <span className="material-symbols-outlined text-base text-[#4edea3]">power_settings_new</span>
            <span className="hidden sm:inline">Salir del Modo Coche</span>
          </motion.button>
        </div>
      </div>

      {/* Center Main Stage with LED Equalizer Circle */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 text-center max-w-5xl xl:max-w-6xl mx-auto w-full">
        <div className="relative mb-6">
          <div
            className={`absolute -inset-4 rounded-full transition-all duration-300 ${
              isPlaying ? 'bg-gradient-to-r from-[#4edea3]/40 via-[#06B6D4]/40 to-[#8B5CF6]/40 blur-xl animate-pulse' : 'bg-white/5 blur-md'
            }`}
          />

          {isPlaying && (
            <motion.div
              className="absolute -inset-6 rounded-full border-2 border-transparent bg-gradient-to-r from-[#4edea3] via-[#06B6D4] via-[#8B5CF6] to-[#ec4899] pointer-events-none opacity-80 blur-[1px]"
              style={{ maskImage: 'linear-gradient(transparent, black)' }}
              animate={{
                rotate: 360,
                filter: [
                  'hue-rotate(0deg) drop-shadow(0 0 10px rgba(78,222,163,0.6))',
                  'hue-rotate(120deg) drop-shadow(0 0 15px rgba(6,182,212,0.8))',
                  'hue-rotate(240deg) drop-shadow(0 0 12px rgba(236,72,153,0.7))',
                  'hue-rotate(360deg) drop-shadow(0 0 10px rgba(78,222,163,0.6))',
                ],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            />
          )}

          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 border-[#4edea3] bg-black/95 flex items-center justify-center relative overflow-hidden shadow-[0_0_50px_rgba(78,222,163,0.4)]">
            {isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-45">
                <div className="absolute w-full h-full flex items-center justify-between px-2">
                  {equalizerLevels.map((lvl, idx) => (
                    <motion.div
                      key={idx}
                      className="w-1.5 bg-gradient-to-t from-[#06B6D4] to-[#4edea3] rounded-full"
                      style={{ height: `${lvl}%` }}
                      animate={{ height: `${Math.max(15, (lvl * (idx % 2 === 0 ? 1 : 0.7)))}%` }}
                      transition={{ duration: 0.12 }}
                    />
                  ))}
                </div>
              </div>
            )}

            {isDrive ? (
              <span className="material-symbols-outlined text-5xl text-[#8B5CF6] animate-pulse z-10">
                cloud_queue
              </span>
            ) : currentStation?.logoUrl ? (
              <img
                src={currentStation.logoUrl}
                alt={currentStation.name}
                className="w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover z-10 opacity-90"
                onError={e => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="material-symbols-outlined text-5xl text-[#4edea3] animate-pulse z-10">
                equalizer
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-2 mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 text-xs text-[#4edea3] uppercase tracking-widest font-bold">
            <span>{isDrive ? 'Google Drive • /mimusica' : (currentStation?.country || 'Mundial')}</span>
            <span>•</span>
            <span>{isDrive ? 'Carpeta Activa' : (currentStation?.genre || 'Radio en Directo')}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] line-clamp-2 max-w-3xl">
            {isDrive ? (currentDriveTrack?.name || 'Selecciona una canción') : (currentStation?.name || 'Sintonizando emisora...')}
          </h1>

          <div className="text-xs sm:text-sm text-gray-400 font-mono tracking-wider flex items-center justify-center gap-3">
            <span className="text-[#06B6D4] font-bold">{isDrive ? 'MP3 High Quality' : (currentStation?.format || 'MP3')}</span>
            {!isDrive && currentStation && currentStation.bitrate > 0 && (
              <>
                <span>•</span>
                <span className="text-[#F59E0B] font-bold">{currentStation.bitrate} kbps</span>
              </>
            )}
            <span>•</span>
            <span className="text-emerald-400 uppercase font-black tracking-widest">
              {playbackStatus === 'buffering'
                ? 'Conectando...'
                : playbackStatus === 'error'
                ? 'Sin señal'
                : isPlaying
                ? (isDrive ? 'REPRODUCIENDO 🎵' : 'EN VIVO 🔴')
                : 'Pausado'}
            </span>
          </div>
        </div>

        {/* Linear Progress / Timeline Bar */}
        <div className="w-full max-w-xl px-4 mt-2">
          <div className="flex items-center justify-between text-xs text-gray-400 font-mono mb-1.5">
            <span>{isDrive ? formatTime(currentTime) : 'EN VIVO'}</span>
            <span className="uppercase tracking-widest text-[#4edea3] font-bold">
              {isDrive ? 'Progresión de Pista' : 'Señal en Directo (Decorativo)'}
            </span>
            <span>{isDrive ? formatTime(duration) : 'LIVE STREAM'}</span>
          </div>

          {isDrive ? (
            <div className="relative group cursor-pointer py-1">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={currentTime}
                onChange={e => driveAudioEngine.seek(parseFloat(e.target.value))}
                className="w-full h-2.5 bg-black/80 rounded-full appearance-none cursor-pointer accent-[#8B5CF6] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)] border border-white/15"
              />
            </div>
          ) : (
            <div className="w-full h-2.5 bg-black/80 rounded-full overflow-hidden border border-white/15 relative">
              <motion.div
                className="h-full bg-gradient-to-r from-[#4edea3] via-[#06B6D4] to-[#8B5CF6]"
                style={{ width: `${isPlaying ? decorProgress : 0}%` }}
                transition={{ ease: 'linear', duration: 0.2 }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom 3D Cosmic Touch Control Deck */}
      <div className="relative z-10 px-6 py-6 bg-gradient-to-t from-black via-black/90 to-black/70 backdrop-blur-2xl border-t border-white/20 flex flex-col items-center gap-6 shadow-[0_-15px_40px_rgba(0,0,0,0.9)]">
        {/* Main Transport 3D Touch Buttons */}
        <div className="flex items-center justify-center gap-8 sm:gap-14">
          {onPrev && (
            <motion.button
              type="button"
              onClick={onPrev}
              whileTap={{ scale: 0.92, y: 3 }}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-white/15 via-white/5 to-white/10 border-2 border-white/30 flex items-center justify-center text-white cursor-pointer shadow-[0_10px_25px_rgba(0,0,0,0.7),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-3px_6px_rgba(0,0,0,0.8)] transition-all hover:border-[#06B6D4]/80"
              title={isDrive ? 'Canción Anterior' : 'Emisora Anterior (Favoritos)'}
            >
              <span className="material-symbols-outlined text-3xl sm:text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                skip_previous
              </span>
            </motion.button>
          )}

          <motion.button
            type="button"
            onClick={onTogglePlay}
            whileTap={{ scale: 0.93, y: 3 }}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#4edea3] via-[#38c98e] to-[#059669] text-black border-4 border-[#022c22] flex items-center justify-center cursor-pointer shadow-[0_12px_35px_rgba(78,222,163,0.5),inset_0_6px_12px_rgba(255,255,255,0.6),inset_0_-6px_12px_rgba(0,0,0,0.4)] transition-all"
            title={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            <span className="material-symbols-outlined text-5xl sm:text-6xl font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
              {playbackStatus === 'buffering' ? 'progress_activity' : isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </motion.button>

          {onNext && (
            <motion.button
              type="button"
              onClick={onNext}
              whileTap={{ scale: 0.92, y: 3 }}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-white/15 via-white/5 to-white/10 border-2 border-white/30 flex items-center justify-center text-white cursor-pointer shadow-[0_10px_25px_rgba(0,0,0,0.7),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-3px_6px_rgba(0,0,0,0.8)] transition-all hover:border-[#06B6D4]/80"
              title={isDrive ? 'Siguiente Canción' : 'Siguiente Emisora (Favoritos)'}
            >
              <span className="material-symbols-outlined text-3xl sm:text-4xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                skip_next
              </span>
            </motion.button>
          )}
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-5 w-full max-w-lg px-6 py-2 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)]">
          <span className="material-symbols-outlined text-[#4edea3] text-2xl drop-shadow-[0_0_8px_rgba(78,222,163,0.5)]">
            {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={e => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-3 bg-black/80 rounded-full appearance-none cursor-pointer accent-[#4edea3] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9),0_1px_2px_rgba(255,255,255,0.2)] border border-white/15"
          />
          <span className="text-sm text-[#4edea3] font-mono font-black w-12 text-right tracking-wider">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
