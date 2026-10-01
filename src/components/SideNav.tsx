import React from 'react';
import { TabType } from '../types/radio';
import { useTranslation } from '../i18n/LanguageContext';

interface SideNavProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  favoritesCount: number;
  alarmsCount?: number;
  onOpenThemes?: () => void;
  onOpenSettings?: () => void;
  activeThemeName?: string;
}

export const SideNav: React.FC<SideNavProps> = ({
  currentTab,
  onSelectTab,
  favoritesCount,
  onOpenThemes,
  onOpenSettings,
  activeThemeName,
}) => {
  const { t } = useTranslation();

  const navItems: { id: TabType; label: string; icon: string; badge?: number }[] = [
    { id: 'descubrir', label: t.nav.radio, icon: 'radio' },
    { id: 'favoritas', label: t.nav.favorites, icon: 'favorite', badge: favoritesCount },
    { id: 'drive', label: t.nav.music, icon: 'folder_open' },
    { id: 'coche', label: t.nav.carMode, icon: 'directions_car' },
  ];

  return (
    <aside className="hidden md:flex flex-col gap-4 xl:gap-6 p-4 xl:p-6 w-56 xl:w-64 bg-[#131313] border-r-3 border-black shadow-[4px_0px_0px_0px_rgba(0,0,0,1)] shrink-0 fixed top-16 left-0 bottom-0 z-30 overflow-y-auto no-scrollbar">
      {/* Logo Container */}
      <div className="flex justify-center items-center w-full pb-2 border-b border-black/30">
        <div className="w-36 h-36 xl:w-44 xl:h-44 bg-black/40 border-3 border-black rounded-2xl overflow-hidden p-1.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:scale-[1.02] transition-transform">
          <img
            src="/logo.svg"
            alt="MyRadio Pro Logo"
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex flex-col gap-2 xl:gap-2.5 flex-1">
        {navItems.map(item => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex items-center justify-between p-3 xl:p-3.5 border-3 border-black font-mono-tech text-xs xl:text-sm font-bold text-left uppercase transition-all duration-100 w-full cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-[#4edea3] text-[#003824] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] translate-x-1'
                  : 'bg-[#201f1f] text-[#e5e2e1] hover:bg-[#353534] hover:translate-x-0.5'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  className="material-symbols-outlined text-xl shrink-0"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[10px] px-2 py-0.5 border-2 border-black font-bold font-mono-tech shrink-0 ml-2 ${
                    isActive ? 'bg-black text-[#4edea3]' : 'bg-[#353534] text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Dynamic Biomes & Themes Option */}
        {onOpenThemes && (
          <button
            type="button"
            onClick={onOpenThemes}
            className="flex items-center justify-between p-3 xl:p-3.5 border-3 border-black font-mono-tech text-xs xl:text-sm font-bold text-left uppercase transition-all duration-100 w-full cursor-pointer bg-[#18181c] text-white hover:bg-[#23232b] hover:translate-x-0.5 mt-2 group shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
            title={t.settings.changeBiome}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span
                className="material-symbols-outlined text-xl shrink-0 group-hover:rotate-12 transition-transform"
                style={{ color: 'var(--color-accent, #00e5ff)' }}
              >
                palette
              </span>
              <span className="truncate">{t.nav.themes}</span>
            </div>
            {activeThemeName && (
              <span
                className="text-[9px] px-1.5 py-0.5 border border-black font-mono-tech uppercase font-bold shrink-0 ml-1.5 truncate max-w-[80px]"
                style={{
                  backgroundColor: 'var(--color-hud-center, #081326)',
                  color: 'var(--color-accent, #00e5ff)',
                  borderColor: 'var(--color-hud-border, rgba(0,229,255,0.4))',
                }}
              >
                {activeThemeName}
              </span>
            )}
          </button>
        )}

        {/* Dynamic Settings Option */}
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center justify-between p-3 xl:p-3.5 border-3 border-black font-mono-tech text-xs xl:text-sm font-bold text-left uppercase transition-all duration-100 w-full cursor-pointer bg-[#201f1f] text-[#e5e2e1] hover:bg-[#353534] hover:translate-x-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] mt-1.5"
            title={t.settings.title}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="material-symbols-outlined text-xl shrink-0 text-[#a3b8cc]">
                settings
              </span>
              <span className="truncate">{t.nav.settings}</span>
            </div>
          </button>
        )}

        {/* Info / Landing Page Link */}
        <a
          href="/info"
          className="flex items-center justify-between p-3 xl:p-3.5 border-3 border-black font-mono-tech text-xs xl:text-sm font-bold text-left uppercase transition-all duration-100 w-full cursor-pointer bg-[#18181c] text-white hover:bg-[#23232b] hover:translate-x-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] mt-1.5"
          title="Ver página de información, características y contacto"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="material-symbols-outlined text-xl shrink-0 text-cyan-400">
              info
            </span>
            <span className="truncate text-cyan-300">Info / Ayuda</span>
          </div>
          <span className="material-symbols-outlined text-sm text-gray-400">open_in_new</span>
        </a>
      </nav>

      {/* System Status Pill */}
      <div className="p-3 bg-[#1A1A1A] border-3 border-black flex flex-col gap-1">
        <div className="flex items-center justify-between font-mono-tech text-[10px] text-[#bbcabf]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
            {t.nav.radioEngine}
          </span>
          <span className="text-[#10B981] font-bold">{t.nav.online}</span>
        </div>
        <div className="font-mono-tech text-[9px] text-[#86948a] truncate">
          {t.nav.streamBuffer}
        </div>
      </div>
    </aside>
  );
};
