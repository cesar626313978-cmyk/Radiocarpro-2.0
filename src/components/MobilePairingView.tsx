import React, { useState } from 'react';
import { teslaPairingService } from '../services/teslaPairingService';
import { auth, googleProvider, loadUserPreferencesFromFirestore } from '../services/firebase';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';

interface MobilePairingViewProps {
  pairCode: string;
  onDone: () => void;
}

export const MobilePairingView: React.FC<MobilePairingViewProps> = ({ pairCode, onDone }) => {
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthorizeCar = async () => {
    setIsAuthorizing(true);
    setError(null);

    try {
      let result;
      try {
        result = await signInWithPopup(auth, googleProvider);
      } catch (err: any) {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
          // Fallback to redirect
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw err;
      }

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error('No se recibió el token de acceso de Google Drive. Asegúrate de conceder permisos de lectura.');
      }

      let userPrefs = null;
      try {
        userPrefs = await loadUserPreferencesFromFirestore(result.user.uid);
      } catch (e) {
        console.warn('Could not load user prefs for pairing:', e);
      }

      const syncKey = result.user.email || result.user.uid;
      const favs = userPrefs?.favorites || [];
      const favObjs = userPrefs?.favoriteStationObjects || [];

      try {
        await teslaPairingService.savePairedPreferences(syncKey, {
          favorites: favs,
          favoriteStationObjects: favObjs,
        });
      } catch (e) {
        console.warn('Could not save paired preferences initial sync:', e);
      }

      await teslaPairingService.completeSession(pairCode, token, {
        uid: result.user.uid,
        email: result.user.email || undefined,
        displayName: result.user.displayName || undefined,
        photoURL: result.user.photoURL || undefined,
        favorites: favs,
        favoriteStationObjects: favObjs,
      });

      setIsSuccess(true);
    } catch (err: any) {
      console.error('Error in mobile authorization:', err);
      setError(err.message || 'Error al autorizar con Google. Inténtalo de nuevo.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white flex flex-col items-center justify-center p-5 font-sans">
      <div className="max-w-md w-full bg-[#181818] border-4 border-black neo-shadow p-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b-2 border-[#2b2b2b] pb-4">
          <div className="w-12 h-12 bg-[#4edea3] text-black border-2 border-black flex items-center justify-center font-black">
            <span className="material-symbols-outlined text-3xl">directions_car</span>
          </div>
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-white">
              Vincular con tu Coche
            </h1>
            <p className="font-mono-tech text-xs text-[#888]">
              RadioStream Car Sync • Conexión de Pantalla
            </p>
          </div>
        </div>

        {/* Pairing code display */}
        <div className="bg-black/60 border-2 border-[#333] p-4 text-center">
          <span className="font-mono-tech text-xs text-[#aaa] uppercase tracking-wider block">
            Código de vinculación en pantalla:
          </span>
          <span className="font-mono-tech text-2xl font-black text-[#4edea3] tracking-widest bg-[#152e22] px-4 py-1 border border-[#4edea3]/50 inline-block mt-1">
            {pairCode}
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-[#EF4444] text-white p-3 border-2 border-black flex items-center gap-2 text-xs font-mono-tech">
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Success state */}
        {isSuccess ? (
          <div className="flex flex-col items-center text-center gap-4 py-4 animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-[#4edea3] text-black flex items-center justify-center font-black border-3 border-black">
              <span className="material-symbols-outlined text-4xl">check</span>
            </div>
            <div>
              <h2 className="text-xl font-black uppercase text-white">¡Coche Vinculado!</h2>
              <p className="font-mono-tech text-xs text-[#bbb] mt-2 leading-relaxed">
                Tu cuenta de Google Drive y Gmail se han sincronizado con la pantalla de tu coche. La música ya está lista para sonar en tus altavoces.
              </p>
            </div>
            <button
              onClick={onDone}
              className="neo-button bg-[#4edea3] text-black px-6 py-2.5 font-mono-tech text-xs font-bold uppercase mt-2 hover:bg-[#3bc791]"
            >
              Continuar a la aplicación
            </button>
          </div>
        ) : (
          /* Normal state */
          <div className="flex flex-col gap-4">
            <div className="font-mono-tech text-xs text-[#ccc] leading-relaxed bg-[#202020] p-3 border border-[#333]">
              <p>
                Al autorizar con tu teléfono, le darás permiso al reproductor de tu coche para acceder a tu música en Google Drive sin que tengas que teclear contraseñas ni lidiar con los bloqueos de pestañas del navegador del vehículo.
              </p>
            </div>

            <button
              onClick={handleAuthorizeCar}
              disabled={isAuthorizing}
              className="neo-button bg-[#4edea3] text-black py-4 px-6 font-mono-tech text-sm font-bold uppercase flex items-center justify-center gap-3 hover:bg-[#3bc791] cursor-pointer"
            >
              {isAuthorizing ? (
                <>
                  <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin shrink-0"></span>
                  <span>Autorizando con Google...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#000" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#000" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#000" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#000" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>Autorizar en mi Coche</span>
                </>
              )}
            </button>
          </div>
        )}

        <div className="border-t border-[#262626] pt-3 text-center font-mono-tech text-[11px] text-[#666]">
          Conexión segura cifrada con Google Identity & Firebase
        </div>
      </div>
    </div>
  );
};
