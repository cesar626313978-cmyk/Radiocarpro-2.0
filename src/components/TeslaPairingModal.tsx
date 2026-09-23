import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { teslaPairingService, TeslaPairingData } from '../services/teslaPairingService';
import { signInWithGoogle, isTeslaBrowser } from '../services/firebase';
import { googleDriveService } from '../services/googleDriveService';

interface TeslaPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (email?: string) => void;
  userEmail?: string;
}

export const TeslaPairingModal: React.FC<TeslaPairingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userEmail,
}) => {
  const [pairingCode, setPairingCode] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [pairUrl, setPairUrl] = useState<string>('');
  const [isWaitingMobile, setIsWaitingMobile] = useState(false);
  const [pairedUser, setPairedUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState<string>('');
  const [showManual, setShowManual] = useState(false);
  const [activeTab, setActiveTab] = useState<'qr' | 'redirect' | 'manual'>('qr');

  useEffect(() => {
    if (!isOpen) return;

    let cleanupFn: (() => void) | undefined;

    const setupPairing = async () => {
      try {
        setError(null);
        setIsWaitingMobile(true);
        const code = teslaPairingService.generatePairingCode();
        setPairingCode(code);

        const currentOrigin = window.location.origin;
        const currentPath = window.location.pathname;
        const fullPairUrl = `${currentOrigin}${currentPath}?pair=${code}`;
        setPairUrl(fullPairUrl);

        // Generate crisp SVG / DataURL QR Code
        const dataUrl = await QRCode.toDataURL(fullPairUrl, {
          width: 280,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrDataUrl(dataUrl);

        cleanupFn = await teslaPairingService.createSession(
          code,
          (data: TeslaPairingData) => {
            if (data.token) {
              googleDriveService.setAccessToken(data.token);
              setPairedUser(data.userEmail || 'Cuenta Google');
              setTimeout(() => {
                onSuccess(data.userEmail);
                onClose();
              }, 1500);
            }
          },
          err => {
            console.error('Pairing error:', err);
            setError('Error de conexión en tiempo real con Firebase.');
          }
        );
      } catch (err: any) {
        console.error('Failed to setup pairing:', err);
        setError(err.message || 'No se pudo iniciar la sesión de emparejamiento.');
      }
    };

    setupPairing();

    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDirectRedirect = async () => {
    try {
      setError(null);
      // Force direct full-page redirect so Tesla browser stays in the same tab
      await signInWithGoogle(true);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar redirección.');
    }
  };

  const handleApplyManualToken = () => {
    if (!manualToken.trim()) {
      setError('Introduce un token de acceso válido de Google.');
      return;
    }
    googleDriveService.setAccessToken(manualToken.trim());
    onSuccess(userEmail || 'Google Drive');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#141414] border-4 border-black neo-shadow max-w-2xl w-full p-6 text-white relative flex flex-col gap-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#2b2b2b] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#4edea3] text-black border-2 border-black flex items-center justify-center font-black">
              <span className="material-symbols-outlined text-2xl">directions_car</span>
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                Conectar Gmail & Google Drive
                <span className="bg-[#4edea3] text-black text-[10px] font-mono-tech font-bold px-2 py-0.5 uppercase">
                  Tesla Ready
                </span>
              </h2>
              <p className="font-mono-tech text-xs text-[#999]">
                Solución optimizada para el navegador de Tesla Model 3 / Highland
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-[#262626] border-2 border-black hover:bg-[#333] flex items-center justify-center cursor-pointer text-[#bbb] hover:text-white"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex items-center gap-2 border-b-2 border-[#262626] pb-3 flex-wrap">
          <button
            onClick={() => setActiveTab('qr')}
            className={`px-3 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer border-2 border-black ${
              activeTab === 'qr' ? 'bg-[#4edea3] text-black font-black' : 'bg-[#222] text-[#bbb] hover:bg-[#2c2c2c]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
            1. Vincular con Móvil (QR)
          </button>
          <button
            onClick={() => setActiveTab('redirect')}
            className={`px-3 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer border-2 border-black ${
              activeTab === 'redirect' ? 'bg-[#06B6D4] text-black font-black' : 'bg-[#222] text-[#bbb] hover:bg-[#2c2c2c]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">open_in_browser</span>
            2. Redirección en esta pestaña
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-3 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1.5 transition-colors cursor-pointer border-2 border-black ${
              activeTab === 'manual' ? 'bg-[#8B5CF6] text-white font-black' : 'bg-[#222] text-[#bbb] hover:bg-[#2c2c2c]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">key</span>
            3. Manual / Token
          </button>
        </div>

        {/* Notification / Paired banner */}
        {pairedUser && (
          <div className="bg-[#4edea3] text-black p-4 border-3 border-black neo-shadow flex items-center gap-3 animate-pulse">
            <span className="material-symbols-outlined text-3xl font-black">check_circle</span>
            <div>
              <div className="font-black text-sm uppercase">¡Tesla Vinculado Correctamente!</div>
              <div className="font-mono-tech text-xs">Conectado a Google Drive con {pairedUser}. Sincronizando canciones...</div>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-[#EF4444] text-white p-3 border-2 border-black flex items-center gap-2 text-xs font-mono-tech">
            <span className="material-symbols-outlined text-lg">warning</span>
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: QR CODE PAIRING (Recommended for Tesla) */}
        {activeTab === 'qr' && (
          <div className="flex flex-col md:flex-row gap-6 items-center">
            {/* QR box */}
            <div className="bg-white p-3 border-4 border-black neo-shadow shrink-0 flex flex-col items-center">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Escanear con el móvil" className="w-56 h-56 object-contain" />
              ) : (
                <div className="w-56 h-56 bg-neutral-200 flex items-center justify-center text-black font-mono-tech text-xs">
                  Generando QR...
                </div>
              )}
              <div className="mt-2 text-center">
                <span className="font-mono-tech text-[11px] text-black font-bold uppercase block tracking-wider">
                  Código de pantalla
                </span>
                <span className="font-mono-tech text-xl text-black font-black tracking-widest bg-yellow-300 px-3 py-0.5 border border-black inline-block mt-0.5">
                  {pairingCode || '...'}
                </span>
              </div>
            </div>

            {/* Step-by-step instructions */}
            <div className="flex-1 flex flex-col gap-3">
              <div className="bg-[#1f1f1f] border-2 border-black p-3">
                <div className="flex items-center gap-2 text-[#4edea3] font-bold text-xs uppercase mb-1 font-mono-tech">
                  <span className="material-symbols-outlined text-base">verified</span>
                  ¿Por qué esta es la mejor opción en Tesla?
                </div>
                <p className="font-mono-tech text-xs text-[#ccc] leading-relaxed">
                  El navegador de Tesla bloquea las ventanas emergentes (popups) de Google abriéndolas en pestañas separadas que no pueden comunicarse entre sí. Al escanear este código con tu teléfono móvil, tu cuenta se autoriza en <strong className="text-white">1 segundo</strong> y la música se activa de inmediato en la pantalla del coche.
                </p>
              </div>

              <div className="flex flex-col gap-2 font-mono-tech text-xs">
                <div className="flex items-start gap-2 bg-[#181818] p-2 border border-[#333]">
                  <span className="w-5 h-5 bg-[#4edea3] text-black font-black flex items-center justify-center text-[11px] shrink-0">1</span>
                  <span>Apunta la cámara de tu móvil al código QR.</span>
                </div>
                <div className="flex items-start gap-2 bg-[#181818] p-2 border border-[#333]">
                  <span className="w-5 h-5 bg-[#4edea3] text-black font-black flex items-center justify-center text-[11px] shrink-0">2</span>
                  <span>Toca el enlace en tu móvil y pulsa <strong className="text-[#4edea3]">"Autorizar en mi Tesla"</strong>.</span>
                </div>
                <div className="flex items-start gap-2 bg-[#181818] p-2 border border-[#333]">
                  <span className="w-5 h-5 bg-[#4edea3] text-black font-black flex items-center justify-center text-[11px] shrink-0">3</span>
                  <span>Esta pantalla se conectará automáticamente sin que tengas que teclear nada en el coche.</span>
                </div>
              </div>

              {isWaitingMobile && !pairedUser && (
                <div className="flex items-center gap-2 text-xs font-mono-tech text-[#4edea3] mt-1 bg-[#10241a] p-2.5 border border-[#4edea3]/40">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3] animate-ping shrink-0"></span>
                  <span>Esperando confirmación desde tu teléfono móvil...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: DIRECT REDIRECT IN SAME WINDOW */}
        {activeTab === 'redirect' && (
          <div className="flex flex-col gap-4 bg-[#1a1a1a] p-5 border-2 border-black">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[#06B6D4] text-3xl">open_in_browser</span>
              <div>
                <h3 className="font-bold text-sm uppercase text-white">Redirección en la misma ventana</h3>
                <p className="font-mono-tech text-xs text-[#bbb] mt-1">
                  En lugar de abrir una pestaña nueva (que en Tesla queda desconectada), este método navegará directamente en esta misma pestaña hacia la página oficial de Google y volverá automáticamente con tus canciones y favoritos cargados.
                </p>
              </div>
            </div>

            <div className="p-3 bg-black/60 border border-[#333] font-mono-tech text-xs text-[#aaa]">
              💡 <strong>Nota para conductores de Tesla:</strong> Al regresar de Google, la aplicación guardará la sesión en el almacenamiento local para que no tengas que repetir este proceso cada vez que entres al coche.
            </div>

            <button
              onClick={handleDirectRedirect}
              className="neo-button bg-[#06B6D4] text-black px-6 py-3 font-mono-tech text-xs font-bold uppercase flex items-center justify-center gap-2 hover:bg-[#0891b2] cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#000" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#000" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#000" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#000" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Iniciar sesión directa con Google
            </button>
          </div>
        )}

        {/* TAB 3: MANUAL TOKEN / ADVANCED */}
        {activeTab === 'manual' && (
          <div className="flex flex-col gap-4 bg-[#1a1a1a] p-5 border-2 border-black">
            <div>
              <h3 className="font-bold text-sm uppercase text-white">Acceso Manual por Token de Drive</h3>
              <p className="font-mono-tech text-xs text-[#bbb] mt-1">
                Si has obtenido un token de acceso temporal de Google OAuth o quieres introducirlo directamente:
              </p>
            </div>

            <input
              type="text"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
              placeholder="Pega aquí el OAuth Access Token (ya29....)"
              className="w-full bg-black border-2 border-[#444] px-3 py-2 text-xs font-mono-tech text-white focus:outline-none focus:border-[#8B5CF6]"
            />

            <button
              onClick={handleApplyManualToken}
              className="neo-button bg-[#8B5CF6] text-white px-6 py-2.5 font-mono-tech text-xs font-bold uppercase flex items-center justify-center gap-2 hover:bg-[#7c3aed] cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">check</span>
              Aplicar Token a Google Drive
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#262626] pt-3 flex items-center justify-between text-[11px] font-mono-tech text-[#777]">
          <span>RadioStream Car Edition • Tesla Model 3 Highland Compatible</span>
          <button onClick={onClose} className="text-[#aaa] hover:text-white underline cursor-pointer">
            Cerrar ventana
          </button>
        </div>
      </div>
    </div>
  );
};
