import React, { useEffect } from 'react';
import { ThemeId, THEMES } from '../types/theme';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  activeTheme: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
}

export const ThemeSelectorModal: React.FC<ThemeSelectorModalProps> = ({
  isOpen,
  activeTheme,
  onSelectTheme,
  onClose,
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#141414] border-3 border-black p-4 sm:p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 sm:pb-4 border-b-2 border-black shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-[#4edea3] text-black border-2 border-black flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-lg sm:text-xl">palette</span>
            </div>
            <div>
              <h2 className="font-mono-tech text-xs tracking-widest text-[#bbcabf] uppercase">
                SISTEMA • TEMATIZACIÓN
              </h2>
              <h1 className="font-black text-lg sm:text-xl text-white uppercase tracking-tight leading-none">
                Biomas y Fondos Dinámicos
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 bg-[#201f1f] hover:bg-[#353534] text-white border-2 border-black flex items-center justify-center font-bold text-sm cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 transition-all"
            title="Cerrar selector de temas"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Subtitle Info */}
        <p className="font-mono-tech text-xs text-[#94a3b8] mt-3 mb-4 shrink-0">
          Selecciona un bioma reactivo para transformar la atmósfera, el canvas interactivo de fondo y la paleta cromática de la cabina y el HUD.
        </p>

        {/* Theme Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 flex-1 py-1">
          {Object.values(THEMES).map((theme) => {
            const isSelected = activeTheme === theme.id;

            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onSelectTheme(theme.id)}
                className={`relative flex flex-col p-3.5 sm:p-4 text-left border-3 border-black transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-[#1e1e24] shadow-[4px_4px_0px_0px_#4edea3] -translate-x-0.5 -translate-y-0.5'
                    : 'bg-[#181818] hover:bg-[#222222] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5'
                }`}
                style={{
                  borderColor: isSelected ? theme.colors.accent : '#000000',
                }}
              >
                {/* Active Badge */}
                {isSelected && (
                  <div
                    className="absolute -top-2.5 right-3 px-2 py-0.5 font-mono-tech text-[9px] font-black uppercase tracking-wider text-black border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1"
                    style={{ backgroundColor: theme.colors.accent }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                    ACTIVO
                  </div>
                )}

                {/* Visual Swatch Preview Box */}
                <div
                  className="w-full h-16 sm:h-20 rounded border-2 border-black mb-3 overflow-hidden relative flex items-center justify-center p-2"
                  style={{
                    background: `radial-gradient(circle at center, ${theme.colors.hudCenter} 0%, ${theme.colors.background} 100%)`,
                  }}
                >
                  {/* Glowing ring simulating the HUD */}
                  <div
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{
                      borderColor: theme.colors.accent,
                      boxShadow: `0 0 16px ${theme.colors.glow}`,
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: theme.colors.accent }}
                    />
                  </div>

                  {/* Biome Icon Badge */}
                  <span
                    className="material-symbols-outlined absolute bottom-1.5 right-1.5 text-base opacity-75"
                    style={{ color: theme.colors.accent }}
                  >
                    {theme.id === 'space'
                      ? 'rocket_launch'
                      : theme.id === 'ocean'
                      ? 'water_drop'
                      : theme.id === 'lunar'
                      ? 'brightness_2'
                      : theme.id === 'canyon'
                      ? 'terrain'
                      : theme.id === 'savanna'
                      ? 'wb_sunny'
                      : 'forest'}
                  </span>
                </div>

                {/* Theme Title & Subtitle */}
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-sm text-white group-hover:text-[#4edea3] transition-colors">
                    {theme.name}
                  </h3>
                </div>

                <div
                  className="font-mono-tech text-[10px] font-semibold tracking-wider uppercase mb-1.5"
                  style={{ color: theme.colors.accent }}
                >
                  {theme.subtitle}
                </div>

                {/* Theme Description */}
                <p className="font-mono-tech text-[10px] text-[#86948a] line-clamp-2 leading-relaxed">
                  {theme.description}
                </p>

                {/* Palette Color Dots */}
                <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-white/10">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    style={{ backgroundColor: theme.colors.accent }}
                    title="Acento principal"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    style={{ backgroundColor: theme.colors.hudCenter }}
                    title="Centro HUD"
                  />
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
                    style={{ backgroundColor: theme.colors.background }}
                    title="Fondo cósmico"
                  />
                  <span className="font-mono-tech text-[9px] text-[#64748b] ml-auto uppercase">
                    {theme.id}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-4 pt-3 border-t-2 border-black flex items-center justify-between shrink-0">
          <div className="font-mono-tech text-[10px] text-[#64748b] hidden sm:block">
            Sincronización en caliente instantánea sin interrumpir el audio
          </div>
          <button
            type="button"
            onClick={onClose}
            className="neo-button bg-[#4edea3] hover:bg-[#3ec48e] text-black font-mono-tech text-xs font-bold px-4 py-2 border-2 border-black uppercase ml-auto shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 cursor-pointer"
          >
            Aplicar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
