import React from 'react';
import { RadioStation, PlaybackStatus } from '../types/radio';
import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { motion } from 'motion/react';

interface GlobalPlayerBarProps {
  activeSource: 'radio' | 'drive';
  currentStation: RadioStation | null;
  currentDriveTrack: DriveAudioFile | null;
  isPlaying: boolean;
  playbackStatus: PlaybackStatus;
  drivePlaybackStatus: DrivePlaybackStatus;
  errorMessage?: string;
  onTogglePlay: () => void;
  onPrevStation: () => void;
  onNextStation: () => void;
  onDrivePrev?: () => void;
  onDriveNext?: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isFavorite: boolean;
  onToggleFavorite: (id: string, station?: RadioStation) => void;
}

export const GlobalPlayerBar: React.FC<GlobalPlayerBarProps> = ({
  activeSource,
  currentStation,
  currentDriveTrack,
  isPlaying,
  playbackStatus,
  drivePlaybackStatus,
  errorMessage,
  onTogglePlay,
  onPrevStation,
  onNextStation,
  onDrivePrev,
  onDriveNext,
  volume,
  onVolumeChange,
  isFavorite,
  onToggleFavorite,
}) => {
  const isDrive = activeSource === 'drive';

  if (!isDrive && !currentStation) return null;
  if (isDrive && !currentDriveTrack && playbackStatus !== 'playing') return null;

  return (
    <div className="fixed bottom-18 md:bottom-0 left-0 md:left-56 xl:left-64 right-0 bg-[#1A1A1A] border-t-3 border-black p-2.5 sm:p-3.5 z-30 flex items-center justify-between gap-2 sm:gap-4 md:gap-6 shadow-[0px_-4px_0px_0px_rgba(0,0,0,1)]">
      {/* Left: Track / Station Info */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-[40%] sm:max-w-[45%]">
        <div
          className="w-9 h-9 sm:w-11 sm:h-11 bg-[#201f1f] border-2 border-black flex items-center justify-center shrink-0 relative overflow-hidden"
          style={{ backgroundColor: isDrive ? '#8B5CF6' : (currentStation?.color || '#201f1f') }}
        >
          <span className="material-symbols-outlined text-white text-lg sm:text-2xl">
            {isDrive ? 'cloud_queue' : 'radio'}
          </span>
          {((isDrive ? drivePlaybackStatus === 'playing' : playbackStatus === 'playing')) && (
            <div className="absolute top-1 right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#10B981] animate-pulse border border-black" />
          )}
          {((isDrive ? drivePlaybackStatus === 'buffering' : playbackStatus === 'buffering')) && (
            <div className="absolute top-1 right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#F59E0B] animate-ping border border-black" />
          )}
          {((isDrive ? drivePlaybackStatus === 'error' : playbackStatus === 'error')) && (
            <div className="absolute top-1 right-1 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#EF4444] border border-black" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h4 className="font-bold text-xs sm:text-sm md:text-base text-white truncate">
              {isDrive ? (currentDriveTrack?.name || 'Música de Google Drive') : currentStation?.name}
            </h4>
            {!isDrive && currentStation && (
              <button
                type="button"
                onClick={() => onToggleFavorite(currentStation.id, currentStation)}
                className="text-[#bbcabf] hover:text-[#EF4444] transition-colors cursor-pointer shrink-0 p-0.5"
                title={isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
              >
                <span
                  className={`material-symbols-outlined text-sm sm:text-base ${
                    isFavorite ? 'text-[#EF4444]' : 'text-[#86948a]'
                  }`}
                  style={isFavorite ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  favorite
                </span>
              </button>
            )}
          </div>

          <div className="font-mono-tech text-[10px] sm:text-[11px] truncate flex items-center gap-1.5 mt-0.5">
            {isDrive ? (
              <span className="text-[#4edea3] truncate font-bold">
                ● {currentDriveTrack?.album ? `📁 ${currentDriveTrack.album}` : 'Google Drive'} {currentDriveTrack?.artist ? `• ${currentDriveTrack.artist}` : ''}
              </span>
            ) : playbackStatus === 'buffering' ? (
              <span className="text-[#F59E0B] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-ping" />
                Conectando...
              </span>
            ) : playbackStatus === 'error' ? (
              <span className="text-[#EF4444] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                {errorMessage || 'No disponible'}
              </span>
            ) : playbackStatus === 'playing' ? (
              <span className="text-[#bbcabf] truncate">
                <span className="text-[#4edea3] font-bold mr-1">●</span>
                {currentStation?.currentTrack || `${currentStation?.genre || 'Radio'}`}
              </span>
            ) : (
              <span className="text-[#bbcabf]">PAUSADO</span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Playback Controls */}
      <div className="flex items-center gap-1.5 sm:gap-3 md:gap-4 justify-center shrink-0">
        <motion.button
          type="button"
          onClick={isDrive ? onDrivePrev : onPrevStation}
          whileTap={{ scale: 0.9, y: 2 }}
          className="w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 text-white flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all shrink-0"
          title={isDrive ? 'Pista anterior' : 'Emisora anterior'}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl text-white">skip_previous</span>
        </motion.button>

        <motion.button
          type="button"
          onClick={onTogglePlay}
          whileTap={{ scale: 0.93, y: 2 }}
          className="w-11 h-11 sm:w-13 sm:h-13 md:w-14 md:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-[0_8px_25px_rgba(0,0,0,0.7)] bg-gradient-to-br from-[#4edea3] via-[#38c98e] to-[#059669] text-black border-2 border-[#022c22] shrink-0"
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          <span
            className="material-symbols-outlined text-2xl sm:text-3xl md:text-4xl font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </motion.button>

        <motion.button
          type="button"
          onClick={isDrive ? onDriveNext : onNextStation}
          whileTap={{ scale: 0.9, y: 2 }}
          className="w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 text-white flex items-center justify-center cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all shrink-0"
          title={isDrive ? 'Pista siguiente' : 'Emisora siguiente'}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl text-white">skip_next</span>
        </motion.button>
      </div>

      {/* Right: Volume (Self-contained, perfectly aligned, no overlapping) */}
      <div className="hidden sm:flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
          className="text-[#bbcabf] hover:text-white cursor-pointer p-1 transition-colors flex items-center justify-center shrink-0"
          title={volume === 0 ? 'Activar sonido' : 'Silenciar'}
          aria-label={volume === 0 ? 'Activar sonido' : 'Silenciar'}
        >
          <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl text-[#4edea3]">
            {volume === 0 ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
        </button>
        <div className="w-16 sm:w-20 md:w-24 lg:w-32 xl:w-36 h-3 sm:h-3.5 bg-black/80 relative flex items-center rounded-full border border-white/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] overflow-hidden cursor-pointer shrink-0">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#38c98e] to-[#4edea3] rounded-full"
            style={{ width: `${volume * 100}%` }}
          />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={e => onVolumeChange(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            title={`Volumen: ${Math.round(volume * 100)}%`}
            aria-label="Control de volumen"
          />
        </div>
        <span className="font-mono-tech text-[10px] sm:text-xs text-[#bbcabf] w-7 text-right select-none hidden lg:inline shrink-0">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
};
