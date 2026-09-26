import React, { useState, useEffect, useMemo } from 'react';
import { RadioStation, PlaybackStatus } from '../types/radio';
import { INITIAL_STATIONS } from '../services/stationsData';
import { searchRadioStations, getTopVotedStations } from '../services/radioBrowserApi';

interface DiscoverViewProps {
  currentStation: RadioStation | null;
  isPlaying: boolean;
  playbackStatus?: PlaybackStatus;
  errorMessage?: string;
  onSelectStation: (station: RadioStation) => void;
  onTogglePlay: () => void;
  favorites: string[];
  onToggleFavorite: (id: string, station?: RadioStation) => void;
  initialStations?: RadioStation[];
  onInstallPWA?: () => void;
  isInstallable?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  Todas: '#4edea3',
  News: '#06B6D4',
  Pop: '#EC4899',
  Rock: '#8B5CF6',
  Electronic: '#84CC16',
  '80s': '#F43F5E',
  Jazz: '#F59E0B',
  'Lo-Fi': '#14B8A6',
  Latin: '#10B981',
  Techno: '#A855F7',
  Eclectic: '#F97316',
  'J-Pop': '#E11D48',
};

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentStation,
  isPlaying,
  playbackStatus = 'idle',
  onSelectStation,
  onTogglePlay,
  favorites,
  onToggleFavorite,
  initialStations = [],
  onInstallPWA,
  isInstallable,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const [stations, setStations] = useState<RadioStation[]>(
    initialStations.length > 0 ? initialStations : INITIAL_STATIONS
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Direct internet search on Radio Browser API (30,000+ stations) with 400ms debounce
  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setSearchError(null);

      try {
        let results: RadioStation[] = [];
        const query = searchQuery.trim();

        if (query) {
          results = await searchRadioStations({
            query,
            limit: 60,
          });
        } else {
          results = await getTopVotedStations(60);
        }

        if (!isMounted) return;

        if (results && results.length > 0) {
          setStations(results);
        } else if (query) {
          // Fallback to local filter if online search yields nothing
          const base = initialStations.length > 0 ? initialStations : INITIAL_STATIONS;
          const fallback = base.filter(
            st =>
              st.name.toLowerCase().includes(query.toLowerCase()) ||
              st.genre.toLowerCase().includes(query.toLowerCase()) ||
              st.country.toLowerCase().includes(query.toLowerCase())
          );
          setStations(fallback);
          if (fallback.length === 0) {
            setSearchError(`No se encontraron emisoras en directo para "${query}".`);
          }
        } else {
          setStations(initialStations.length > 0 ? initialStations : INITIAL_STATIONS);
        }
      } catch (err) {
        console.error('Error fetching online stations:', err);
        if (isMounted) {
          const base = initialStations.length > 0 ? initialStations : INITIAL_STATIONS;
          setStations(base);
          setSearchError('Catálogo local activo (sin conexión con Radio Browser).');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery, initialStations]);

  // Prioritize user favorites at the top of the search/browse results
  const sortedStations = useMemo(() => {
    const list = [...stations];
    list.sort((a, b) => {
      const aIsFav = favorites.includes(a.id) ? 1 : 0;
      const bIsFav = favorites.includes(b.id) ? 1 : 0;
      if (aIsFav !== bIsFav) {
        return bIsFav - aIsFav; // Favorites first
      }
      return 0; // maintain vote/relevance order
    });
    return list;
  }, [stations, favorites]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSearchError(null);
  };

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3.5 w-full">
      {/* Minimalist PWA Top Bar: Ultra-compact, zero wasted vertical space */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-pulse" />
          <h2 className="font-mono-tech text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
            Emisoras en Vivo (30.000+ Online)
          </h2>
          <span className="text-[10px] font-mono-tech px-1.5 py-0.5 bg-[#1A1A1A] border border-black text-[#4edea3] font-bold">
            {sortedStations.length}
          </span>
        </div>

        {/* In-App PWA Install Trigger */}
        {isInstallable && onInstallPWA && (
          <button
            type="button"
            onClick={onInstallPWA}
            className="neo-button bg-[#4edea3] hover:bg-[#38c98e] text-[#003824] px-2.5 py-1 text-[10px] font-mono-tech font-black uppercase border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
            title="Instalar Myradio Pro 2.0 en la pantalla de inicio"
          >
            <span className="material-symbols-outlined text-xs">download</span>
            <span>Instalar PWA</span>
          </button>
        )}
      </div>

      {/* Streamlined Direct Internet Search Input */}
      <div className="relative flex items-center w-full group">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-[#4edea3] text-black flex items-center justify-center border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] pointer-events-none group-focus-within:scale-105 transition-transform">
          <span className="material-symbols-outlined text-lg font-black">search</span>
        </div>
        <input
          id="realtime-station-search-input"
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Busca cualquier emisora o país en internet (ej. SER, Ibiza, Jazz, Madrid)..."
          className="w-full bg-[#18392b] hover:bg-[#1d4434] focus:bg-[#1f4937] border-2 border-black text-white pl-12 pr-10 py-3 font-mono-tech text-xs sm:text-sm font-semibold placeholder:text-[#9bc7ae] focus:outline-none focus:border-[#4edea3] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] focus:shadow-[3px_3px_0px_0px_#4edea3] transition-all"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#254f3c] hover:bg-[#316950] text-white border border-black flex items-center justify-center cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
            title="Borrar búsqueda"
          >
            <span className="material-symbols-outlined text-sm font-bold">close</span>
          </button>
        ) : (
          <span className="hidden sm:inline-flex items-center text-[10px] font-mono-tech uppercase font-bold text-[#4edea3] bg-[#0c261b] px-2 py-0.5 border border-[#4edea3]/40 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            30.000+ EN VIVO
          </span>
        )}
      </div>

      {/* Search Error Notice */}
      {searchError && (
        <div className="bg-[#EF4444]/20 border border-[#EF4444] p-2 text-xs font-mono-tech text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#EF4444] text-base">info</span>
          <span>{searchError}</span>
        </div>
      )}

      {/* Stations Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#1A1A1A] border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <span className="material-symbols-outlined text-3xl text-[#4edea3] animate-spin mb-2">
            sync
          </span>
          <p className="font-mono-tech text-xs text-[#bbcabf] uppercase tracking-wider">
            Buscando en la red mundial (30.000+ emisoras)...
          </p>
        </div>
      ) : sortedStations.length === 0 ? (
        /* Empty State */
        <div className="p-6 sm:p-8 text-center bg-[#1A1A1A] border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center">
          <span className="material-symbols-outlined text-4xl text-[#86948a] mb-1">
            search_off
          </span>
          <h3 className="font-bold text-sm sm:text-base text-white uppercase">
            Sin resultados
          </h3>
          <p className="font-mono-tech text-xs text-[#bbcabf] mt-1 max-w-xs">
            {searchQuery
              ? `No se encontraron emisoras en internet para "${searchQuery}"`
              : 'No se encontraron emisoras disponibles'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleClearFilters}
              className="neo-button bg-[#4edea3] text-[#003824] px-3 py-1.5 font-mono-tech text-[11px] font-black uppercase border border-black cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        </div>
      ) : (
        /* Station Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 min-[1800px]:grid-cols-5 gap-3">
          {sortedStations.map(station => {
            const isCurrent = currentStation?.id === station.id;
            const isFav = favorites.includes(station.id);

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
                className={`p-3 flex flex-col justify-between border-2 border-black transition-all cursor-pointer group relative overflow-hidden active:scale-[0.99] ${
                  isCurrent
                    ? 'bg-[#201f1f] shadow-[3px_3px_0px_0px_rgba(78,222,163,0.8)] border-[#4edea3]'
                    : isFav
                    ? 'bg-[#1e2321] hover:bg-[#252525] shadow-[3px_3px_0px_0px_rgba(239,68,68,0.4)] border-[#EF4444]/60'
                    : 'bg-[#1A1A1A] hover:bg-[#252525] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                }`}
              >
                {/* Status Bar inside card */}
                <div className="flex justify-between items-center text-xs font-mono-tech mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {isCurrent ? (
                      playbackStatus === 'buffering' ? (
                        <span className="inline-flex items-center gap-1 text-[#F59E0B] font-bold uppercase text-[9px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-ping" />
                          Conectando...
                        </span>
                      ) : playbackStatus === 'error' ? (
                        <span className="inline-flex items-center gap-1 text-[#EF4444] font-bold uppercase text-[9px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                          No disponible
                        </span>
                      ) : isPlaying ? (
                        <span className="inline-flex items-center gap-1 text-[#4edea3] font-bold uppercase text-[9px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
                          En Directo
                        </span>
                      ) : (
                        <span className="text-[#bbcabf] text-[9px] font-bold">PAUSADA</span>
                      )
                    ) : isFav ? (
                      <span className="inline-flex items-center gap-1 text-[#EF4444] font-bold uppercase text-[9px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                        Favorita ★
                      </span>
                    ) : (
                      <span className="text-[#bbcabf] text-[9px] uppercase font-bold">
                        {station.countryCode || 'RADIO'}
                      </span>
                    )}
                  </div>

                  {/* Favorite Button */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onToggleFavorite(station.id, station);
                    }}
                    className="text-[#bbcabf] hover:text-[#EF4444] p-1 cursor-pointer transition-colors"
                    title={isFav ? 'Quitar de favoritas' : 'Añadir a favoritas'}
                  >
                    <span
                      className={`material-symbols-outlined text-base ${
                        isFav ? 'text-[#EF4444]' : 'text-[#86948a]'
                      }`}
                      style={isFav ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      favorite
                    </span>
                  </button>
                </div>

                {/* Station Art & Name */}
                <div className="flex items-center gap-2.5 my-0.5">
                  <div
                    className="w-10 h-10 border border-black flex items-center justify-center shrink-0 overflow-hidden relative"
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
                      <span className="material-symbols-outlined text-white text-xl">
                        radio
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-mono-tech text-xs sm:text-sm font-bold text-white truncate group-hover:text-[#4edea3]">
                      {station.name}
                    </h3>
                    <p className="text-[11px] text-[#bbcabf] truncate font-['Inter'] mt-0.5">
                      {station.country} •{' '}
                      <span
                        className="font-bold"
                        style={{ color: CATEGORY_COLORS[station.genre] || '#4edea3' }}
                      >
                        {station.genre}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Bottom Bar: Format, Bitrate, Play Action */}
                <div className="flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-black/60 min-w-0">
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
