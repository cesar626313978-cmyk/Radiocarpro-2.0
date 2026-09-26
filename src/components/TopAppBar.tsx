import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { TabType } from '../types/radio';

interface TopAppBarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenSettings: () => void;
  onOpenThemes?: () => void;
  lang: 'ES' | 'EN';
  onToggleLang: () => void;
  user: User | null;
  onLoginWithGoogle: () => void;
  onLogout: () => void;
  onOpenCarPairing?: () => void;
  onOpenTeslaPairing?: () => void;
  isSyncing?: boolean;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
  onOpenThemes,
  user,
  onLoginWithGoogle,
  onLogout,
  onOpenCarPairing,
  onOpenTeslaPairing,
  isSyncing = false,
}) => {
  const triggerCarPairing = onOpenCarPairing || onOpenTeslaPairing;
  const [showUserMenu, setShowUserMenu] = useState(false);
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
      console.warn('Fullscreen toggle failed:', err);
    }
  };

  const navTabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'descubrir', label: 'RADIO', icon: 'radio' },
    { id: 'favoritas', label: 'FAVORITAS', icon: 'favorite' },
    { id: 'drive', label: 'MUSIC', icon: 'folder_open' },
    { id: 'coche', label: 'MODO COCHE', icon: 'directions_car' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#1A1A1A] border-b-3 border-black w-full shadow-[0px_4px_0px_0px_rgba(0,0,0,1)]">
      <div className="w-full px-3 sm:px-4 md:px-6 h-16 flex items-center justify-between gap-3">
        {/* Brand Zone: 1 single clean line */}
        <div
          onClick={() => onSelectTab('descubrir')}
          className="flex items-center gap-2 cursor-pointer select-none group shrink-0"
        >
          <div className="w-9 h-9 bg-[#4edea3] border-2 border-black flex items-center justify-center font-black text-black text-xl group-hover:rotate-6 transition-transform">
            <span className="material-symbols-outlined text-black font-black text-2xl">
              radio
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-black text-xl tracking-tighter text-white uppercase font-['Inter']">
              Myradio 1.0 Pro
            </span>
            <span className="bg-[#8B5CF6] text-white text-[9px] font-mono-tech font-bold px-1.5 py-0.5 border border-black uppercase hidden sm:inline-block">
              LIVE
            </span>
          </div>
        </div>

        {/* Navigation links (hidden on narrower viewports to avoid crushing header actions) */}
        <nav className="hidden min-[1180px]:flex items-center gap-1.5">
          {navTabs.map(tab => {
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`px-3 py-1.5 font-mono-tech text-xs font-bold uppercase transition-all whitespace-nowrap shrink-0 border-2 border-black flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#4edea3] text-[#003824] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-[#201f1f] text-[#e5e2e1] hover:bg-[#353534]'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Actions Zone: Responsive Login + Settings + Fullscreen */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* User Auth Profile (Firebase + Gmail) */}
          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 sm:gap-2 bg-[#201f1f] border-2 border-black p-1 sm:pr-2.5 hover:bg-[#353534] transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                title={user.displayName || user.email || 'Perfil de usuario'}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuario'}
                    className="w-7 h-7 rounded-full border border-black object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[#8B5CF6] text-white border border-black flex items-center justify-center font-bold text-xs">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left hidden md:block">
                  <div className="font-mono-tech text-[11px] font-bold text-white truncate max-w-[110px]">
                    {user.displayName || user.email?.split('@')[0]}
                  </div>
                  <div className="font-mono-tech text-[9px] text-[#4edea3] flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
                    {isSyncing ? 'SYNC...' : 'CLOUD SYNC'}
                  </div>
                </div>
                <span className="material-symbols-outlined text-sm text-[#bbcabf]">
                  arrow_drop_down
                </span>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-[#201f1f] border-3 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-3 flex flex-col gap-2 z-50">
                  <div className="border-b-2 border-black pb-2">
                    <div className="font-bold text-white text-xs truncate">
                      {user.displayName || 'Usuario de Google'}
                    </div>
                    <div className="font-mono-tech text-[10px] text-[#bbcabf] truncate">
                      {user.email}
                    </div>
                    <div className="mt-1 font-mono-tech text-[9px] text-[#10B981] bg-black/40 px-2 py-0.5 border border-black flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">cloud_done</span>
                      Favoritas sincronizadas
                    </div>
                  </div>

                  {triggerCarPairing && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        triggerCarPairing();
                      }}
                      className="w-full text-left font-mono-tech text-xs text-[#bbcabf] hover:text-white p-2 bg-[#181818] border border-[#333] flex items-center gap-2 hover:bg-[#252525] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm text-[#4edea3]">qr_code_scanner</span>
                      Vincular Coche con Móvil (QR)
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="neo-button bg-[#EF4444] text-white font-mono-tech text-xs font-bold py-2 border-2 border-black uppercase flex items-center justify-center gap-2 hover:bg-[#dc2626]"
                  >
                    <span className="material-symbols-outlined text-sm">logout</span>
                    Cerrar Sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* 1. Google Gmail Login Button (Responsive) */}
              <button
                onClick={onLoginWithGoogle}
                className="neo-button bg-white text-black font-mono-tech text-xs font-bold px-2 sm:px-2.5 lg:px-3 py-1.5 border-2 border-black flex items-center gap-1.5 uppercase hover:bg-[#e5e2e1] whitespace-nowrap cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 shrink-0"
                title="Iniciar sesión con Google para sincronizar tus preferencias"
                aria-label="Acceder con Google"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="hidden sm:inline">
                  <span className="hidden xl:inline">Acceder con </span>Gmail
                </span>
              </button>

              {/* 2. Car QR Pairing Button (Responsive) */}
              {triggerCarPairing && (
                <button
                  onClick={triggerCarPairing}
                  className="neo-button bg-[#4edea3] text-black font-mono-tech text-xs font-bold px-2 sm:px-2.5 py-1.5 border-2 border-black flex items-center gap-1.5 uppercase hover:bg-[#3bc791] whitespace-nowrap cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 shrink-0"
                  title="Vincular con tu móvil mediante código QR (ideal para la pantalla del coche)"
                  aria-label="Vincular Coche con QR"
                >
                  <span className="material-symbols-outlined text-sm shrink-0">qr_code_scanner</span>
                  <span className="hidden sm:inline">
                    <span className="hidden xl:inline">Vincular </span>Coche (QR)
                  </span>
                </button>
              )}
            </div>
          )}

          {/* 3. Themes Button (Biomas & Fondos) */}
          {onOpenThemes && (
            <button
              onClick={onOpenThemes}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-[#201f1f] text-white border-2 border-black hover:bg-[#353534] transition-colors cursor-pointer flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 shrink-0 group"
              title="Temas visuales y biomas dinámicos (Espacio, Fondo Marino, Lunar, Cañón, Sabana, Selva)"
              aria-label="Temas"
            >
              <span
                className="material-symbols-outlined text-base sm:text-lg group-hover:rotate-12 transition-transform"
                style={{ color: 'var(--color-accent, #00e5ff)' }}
              >
                palette
              </span>
            </button>
          )}

          {/* 4. Settings Button (Rueda dentada, safely placed and sized) */}
          <button
            onClick={onOpenSettings}
            className="w-8 h-8 sm:w-9 sm:h-9 bg-[#201f1f] text-white border-2 border-black hover:bg-[#353534] transition-colors cursor-pointer flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 shrink-0"
            title="Ajustes de la aplicación"
            aria-label="Ajustes"
          >
            <span className="material-symbols-outlined text-base sm:text-lg">settings</span>
          </button>

          {/* 5. Fullscreen Toggle Button */}
          <button
            type="button"
            onClick={handleToggleFullscreen}
            className="w-8 h-8 sm:w-9 sm:h-9 bg-[#201f1f] hover:bg-[#353534] text-white border-2 border-black font-mono-tech text-xs font-bold uppercase transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer active:translate-y-0.5 flex items-center justify-center shrink-0"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa Coche (1920x1200)'}
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            <span className="material-symbols-outlined text-base sm:text-lg text-[#4edea3]">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
