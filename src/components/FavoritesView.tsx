import React from 'react';
import { RadioStation, PlaybackStatus } from '../types/radio';

interface FavoritesViewProps {
  favoriteStations: RadioStation[];
  currentStation: RadioStation | null;
  isPlaying: boolean;
  playbackStatus?: PlaybackStatus;
  errorMessage?: string;
  onSelectStation: (station: RadioStation) => void;
  onTogglePlay: () => void;
  onToggleFavorite: (id: string, station?: RadioStation) => void;
  onNavigateToDiscover: () => void;
  isDriveConnected?: boolean;
  onConnectDrive?: () => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({
  favoriteStations,
  currentStation,
  isPlaying,
  playbackStatus = 'idle',
  onSelectStation,
  onTogglePlay,
  onToggleFavorite,
  onNavigateToDiscover,
  isDriveConnected = false,
  onConnectDrive,
}) => {
  return (
    <div className="flex flex-col gap-2.5 sm:gap-3.5 w-full">
      {/* Page Header (Minimalist & Compact) */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-[#EF4444] text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            favorite
          </span>
          <h2 className="font-mono-tech text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Mis Favoritas
          </h2>
          <span className="text-[10px] font-mono-tech px-1.5 py-0.5 bg-[#1A1A1A] border border-black text-[#4edea3] font-bold">
            {favoriteStations.length}
          </span>
        </div>

        {/* Sync Status Badge */}
        {isDriveConnected ? (
          <div className="flex items-center gap-1.5 bg-[#1A1A1A] px-2 py-0.5 border border-black text-[10px] font-mono-tech text-[#4edea3] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
            <span>Sincronizado en Drive</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-[#1A1A1A] px-2 py-0.5 border border-black text-[10px] font-mono-tech text-[#f59e0b] font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            <span>Desconectado de Drive</span>
          </div>
        )}
      </div>

      {!isDriveConnected ? (
        <div className="bg-[#1A1A1A] border-3 border-black p-8 sm:p-12 text-center flex flex-col items-center justify-center neo-shadow">
          <div className="w-16 h-16 rounded-full bg-[#f59e0b]/10 border-2 border-[#f59e0b]/40 flex items-center justify-center mb-4 text-[#f59e0b]">
            <span className="material-symbols-outlined text-3xl">hard_drive</span>
          </div>
          <h3 className="font-black text-xl text-white uppercase mb-2">
            Lista de Favoritas Vacía
          </h3>
          <p className="text-[#bbcabf] font-mono-tech text-xs max-w-md mb-6 leading-relaxed">
            La lista de favoritas está vacía porque no estás conectado a Google Drive. Inicia sesión con tu cuenta de Google para guardar, cargar y sincronizar tus emisoras favoritas en la nube y en tu vehículo.
          </p>
          {onConnectDrive && (
            <button
              onClick={onConnectDrive}
              className="neo-button bg-[#4edea3] text-[#003824] px-6 py-3 font-mono-tech text-xs font-black uppercase hover:bg-[#38c98e] flex items-center gap-2 cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            >
              <span className="material-symbols-outlined text-base">cloud_sync</span>
              <span>Conectar Google Drive</span>
            </button>
          )}
        </div>
      ) : favoriteStations.length === 0 ? (
        <div className="bg-[#1A1A1A] border-3 border-black p-12 text-center flex flex-col items-center justify-center neo-shadow">
          <span className="material-symbols-outlined text-5xl text-[#86948a] mb-3">
            favorite_border
          </span>
          <h3 className="font-black text-xl text-white uppercase mb-1">
            No tienes emisoras favoritas aún
          </h3>
          <p className="text-[#bbcabf] font-mono-tech text-xs max-w-md mb-6">
            Explora el catálogo global de emisoras de radio y haz clic en el corazón para guardarlas aquí.
          </p>
          <button
            onClick={onNavigateToDiscover}
            className="neo-button bg-[#4edea3] text-[#003824] px-6 py-3 font-mono-tech text-xs font-black uppercase hover:bg-[#38c98e]"
          >
            Explorar Emisoras
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-5 gap-3 sm:gap-4">
          {favoriteStations.map(station => {
            const isCurrent = currentStation?.id === station.id;

            return (
              <div
                key={station.id}
                onClick={() => {
                  if (isCurrent && playbackStatus !== 'error') {
                    onTogglePlay();
                  } else {
                    onSelectStation(station);
                  }
                }}
                className={`p-3.5 flex flex-col justify-between border-3 border-black transition-all cursor-pointer group relative overflow-hidden ${
                  isCurrent
                    ? 'bg-[#201f1f] shadow-[4px_4px_0px_0px_rgba(78,222,163,0.8)] border-[#4edea3]'
                    : 'bg-[#1A1A1A] hover:bg-[#252525] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                }`}
              >
                {/* Top Status Header */}
                <div className="flex justify-between items-center text-xs font-mono-tech mb-2">
                  <div className="flex items-center gap-1.5">
                    {isCurrent ? (
                      playbackStatus === 'buffering' ? (
                        <span className="inline-flex items-center gap-1 text-[#F59E0B] font-black uppercase text-[10px]">
                          <span className="w-2 h-2 rounded-full bg-[#F59E0B] animate-ping" />
                          Conectando...
                        </span>
                      ) : playbackStatus === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-[#EF4444] font-black uppercase text-[10px]">
                          <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                          No disponible
                        </span>
                      ) : isPlaying ? (
                        <span className="inline-flex items-center gap-1 text-[#4edea3] font-black uppercase text-[10px]">
                          <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
                          En Directo
                        </span>
                      ) : (
                        <span className="text-[#bbcabf] text-[10px] font-bold">PAUSADA</span>
                      )
                    ) : (
                      <span className="text-[#bbcabf] text-[10px] uppercase font-bold">
                        {station.countryCode || 'WORLD'}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onToggleFavorite(station.id, station);
                    }}
                    className="text-[#EF4444] hover:text-white p-1 cursor-pointer transition-colors"
                    title="Quitar de favoritas"
                  >
                    <span
                      className="material-symbols-outlined text-lg text-[#EF4444]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      favorite
                    </span>
                  </button>
                </div>

                {/* Station Art & Name */}
                <div className="flex items-center gap-3 my-1">
                  <div
                    className="w-13 h-13 border-2 border-black flex items-center justify-center shrink-0 overflow-hidden relative"
                    style={{ backgroundColor: station.color || '#201f1f' }}
                  >
                    {station.logoUrl ? (
                      <img
                        src={station.logoUrl}
                        alt={station.name}
                        className="w-full h-full object-cover"
                        onError={e => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="material-symbols-outlined text-white text-2xl">
                        radio
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-mono-tech text-sm font-black text-white truncate group-hover:text-[#4edea3]">
                      {station.name}
                    </h3>
                    <p className="text-xs text-[#bbcabf] truncate font-['Inter'] mt-0.5">
                      {station.country} • {station.genre}
                    </p>
                  </div>
                </div>

                {/* Bottom Bar */}
                <div className="flex items-center justify-between gap-1.5 mt-3 pt-2 border-t border-black/80 min-w-0">
                  <div className="flex items-center gap-1 font-mono-tech text-[9px] text-[#bbcabf] shrink-0">
                    <span className="bg-black px-1.5 py-0.5 text-[#06B6D4] font-bold shrink-0">
                      {station.format}
                    </span>
                    {station.bitrate > 0 && (
                      <span className="bg-black px-1.5 py-0.5 text-[#F59E0B] font-bold shrink-0">
                        {station.bitrate}K
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (isCurrent && playbackStatus !== 'error') {
                        onTogglePlay();
                      } else {
                        onSelectStation(station);
                      }
                    }}
                    title={
                      isCurrent && isPlaying
                        ? 'Pausar emisión'
                        : isCurrent && playbackStatus === 'buffering'
                        ? 'Conectando...'
                        : isCurrent && playbackStatus === 'error'
                        ? 'Reintentar sintonización'
                        : 'Sintonizar'
                    }
                    aria-label={
                      isCurrent && isPlaying
                        ? 'Pausar emisión'
                        : isCurrent && playbackStatus === 'buffering'
                        ? 'Conectando...'
                        : isCurrent && playbackStatus === 'error'
                        ? 'Reintentar sintonización'
                        : 'Sintonizar'
                    }
                    className={`w-11 h-7 sm:w-12 sm:h-7.5 rounded-sm border-2 border-black flex items-center justify-center cursor-pointer shrink-0 transition-all select-none ${
                      isCurrent && isPlaying
                        ? 'bg-[#181818] text-[#4edea3] shadow-[0_3px_0_0_#000000] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                        : isCurrent && playbackStatus === 'error'
                        ? 'bg-[#EF4444] text-white shadow-[0_3px_0_0_#991b1b] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#991b1b] active:translate-y-[3px] active:shadow-none'
                        : isCurrent && playbackStatus === 'buffering'
                        ? 'bg-[#F59E0B] text-black shadow-[0_3px_0_0_#b45309] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#b45309] active:translate-y-[3px] active:shadow-none'
                        : 'bg-gradient-to-b from-[#5af3b6] to-[#38c98e] text-[#003824] shadow-[0_3px_0_0_#000000] hover:from-[#6df5c1] hover:to-[#43d499] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                    }`}
                  >
                    {isCurrent && playbackStatus === 'buffering' ? (
                      <span className="material-symbols-outlined text-sm font-bold animate-spin">
                        progress_activity
                      </span>
                    ) : isCurrent && playbackStatus === 'error' ? (
                      <span className="material-symbols-outlined text-sm font-bold">refresh</span>
                    ) : isCurrent && isPlaying ? (
                      <span
                        className="material-symbols-outlined text-base font-black"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        pause
                      </span>
                    ) : (
                      <span
                        className="material-symbols-outlined text-lg font-black ml-0.5"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        play_arrow
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
