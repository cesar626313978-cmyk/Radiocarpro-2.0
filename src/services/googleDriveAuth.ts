/**
 * Módulo de Autenticación OAuth 2.0 (Google Identity Services)
 * Audio-Car Production - Dominio Canónico: https://www.audio-car.es/
 */

import { teslaPairingService } from './teslaPairingService';

// Fallback robusto: lee de variable de entorno (Vite) o usa el ID de producción directo
export const GOOGLE_CLIENT_ID: string = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) ||
  '1094273500016-v1jtdlpm11qhdk1vdbmo1g2o0469r464.apps.googleusercontent.com';

export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any = null;
let activeTokenCallback: ((token: string) => void) | null = null;
let activeErrorCallback: ((error: any) => void) | null = null;

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * Obtiene el correo electrónico de la cuenta activa o emparejada como hint para renovación silenciosa
 */
export function getUserEmailHint(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const paired = localStorage.getItem('radiostream_paired_user');
    if (paired) {
      const u = JSON.parse(paired);
      if (u && typeof u.email === 'string' && u.email.includes('@')) {
        return u.email;
      }
    }
    const sessionEmail = sessionStorage.getItem('gdrive_user_email') || localStorage.getItem('gdrive_user_email');
    if (sessionEmail && sessionEmail.includes('@')) {
      return sessionEmail;
    }
  } catch {}
  return undefined;
}

/**
 * Guarda el correo del usuario para agilizar futuras renovaciones silenciosas con GIS
 */
export function setUserEmailHint(email: string): void {
  if (typeof window === 'undefined' || !email) return;
  try {
    sessionStorage.setItem('gdrive_user_email', email);
    localStorage.setItem('gdrive_user_email', email);
  } catch {}
}

/**
 * Sincroniza silenciosamente el token desde la nube (Firestore / sesión emparejada de vehículo)
 * sin abrir ventanas emergentes ni provocar bloqueos del navegador.
 */
export async function syncTokenFromCloud(userEmailHint?: string): Promise<string | null> {
  const hint = userEmailHint || getUserEmailHint();
  if (!hint) return null;

  try {
    const prefs = await teslaPairingService.getPairedPreferences(hint);
    if (prefs?.driveToken) {
      const remainingSec = prefs.driveTokenExpiresAt
        ? Math.round((prefs.driveTokenExpiresAt - Date.now()) / 1000)
        : 3600;
      if (remainingSec > 60) {
        console.log('[GoogleDriveAuth] Token sincronizado silenciosamente desde la nube (Firestore).');
        storeAccessToken(prefs.driveToken, remainingSec);
        if (typeof activeTokenCallback === 'function') {
          try {
            activeTokenCallback(prefs.driveToken);
          } catch {}
        }
        return prefs.driveToken;
      }
    }
  } catch (err) {
    console.warn('[GoogleDriveAuth] Sincronización en la nube omitida:', err);
  }
  return null;
}

/**
 * Inicializa el cliente GIS una vez cargado el script https://accounts.google.com/gsi/client
 */
export function initGoogleAuth(
  onTokenReceived?: (token: string) => void,
  onError?: (error: any) => void
): any {
  if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    console.warn('[Auth] SDK de Google Identity Services aún no disponible en window.');
    return null;
  }

  if (onTokenReceived) activeTokenCallback = onTokenReceived;
  if (onError) activeErrorCallback = onError;

  if (tokenClient) {
    return tokenClient;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: OAUTH_SCOPE,
    callback: (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        const expiresInSec = parseInt(tokenResponse.expires_in, 10) || 3600;
        storeAccessToken(tokenResponse.access_token, expiresInSec);

        console.log('[Auth] Token de acceso recibido y almacenado exitosamente.');

        if (typeof activeTokenCallback === 'function') {
          activeTokenCallback(tokenResponse.access_token);
        }
      } else {
        console.error('[Auth] Respuesta OAuth sin token de acceso:', tokenResponse);
        if (typeof activeErrorCallback === 'function') {
          activeErrorCallback(new Error('[Auth] Respuesta sin token de acceso'));
        }
      }
    },
    error_callback: (error: any) => {
      console.warn('[Auth Error]:', error);
      if (typeof activeErrorCallback === 'function') {
        activeErrorCallback(error);
      }
    }
  });

  return tokenClient;
}

/**
 * Solicita o refresca el token de acceso mostrando el diálogo oficial de Google
 * Se debe ejecutar EXCLUSIVAMENTE en respuesta a un gesto directo del usuario (clic).
 */
export function requestGoogleAccessToken(promptType: string = ''): void {
  if (!tokenClient) {
    initGoogleAuth();
  }
  if (!tokenClient) {
    throw new Error('[Auth] El cliente OAuth no ha sido inicializado. Ejecuta initGoogleAuth() primero.');
  }
  const emailHint = getUserEmailHint();
  const requestConfig: any = { prompt: promptType };
  if (emailHint) {
    requestConfig.hint = emailHint;
  }
  tokenClient.requestAccessToken(requestConfig);
}

let isRefreshing = false;
let lastRefreshAttempt = 0;

/**
 * Intenta renovar el token OAuth de Google Drive.
 * En segundo plano (sin interacción del usuario, isUserGesture = false):
 * consulta Firestore/nube para evitar que el navegador bloquee popups ([GSI_LOGGER]: Failed to open popup window).
 * Con gesto del usuario (isUserGesture = true):
 * invoca el flujo interactivo oficial de Google Identity Services.
 */
export async function trySilentTokenRefresh(userEmailHint?: string, isUserGesture = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  // 1. Siempre intentar sincronización en la nube primero (sin abrir ventanas emergentes)
  const cloudToken = await syncTokenFromCloud(userEmailHint);
  if (cloudToken) {
    return cloudToken;
  }

  // 2. Si no hay interacción directa del usuario, NUNCA disparar requestAccessToken()
  // para evitar [GSI_LOGGER]: Failed to open popup window on url... Maybe blocked by the browser?
  if (!isUserGesture) {
    return null;
  }

  // 3. Con interacción de usuario (clic en botón):
  if (isRefreshing && (Date.now() - lastRefreshAttempt < 10000)) {
    return null;
  }

  let waitCount = 0;
  while ((!window.google || !window.google.accounts || !window.google.accounts.oauth2) && waitCount < 10) {
    await new Promise(r => setTimeout(r, 200));
    waitCount++;
  }

  if (!window.google?.accounts?.oauth2) {
    return null;
  }

  isRefreshing = true;
  lastRefreshAttempt = Date.now();

  const hint = userEmailHint || getUserEmailHint();

  return new Promise((resolve) => {
    try {
      let done = false;
      const timeoutId = setTimeout(() => {
        if (!done) {
          done = true;
          isRefreshing = false;
          resolve(null);
        }
      }, 10000);

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: OAUTH_SCOPE,
        callback: (tokenResponse: any) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          isRefreshing = false;
          if (tokenResponse && tokenResponse.access_token) {
            const expiresIn = parseInt(tokenResponse.expires_in, 10) || 3600;
            storeAccessToken(tokenResponse.access_token, expiresIn);
            if (typeof activeTokenCallback === 'function') {
              try {
                activeTokenCallback(tokenResponse.access_token);
              } catch {}
            }
            resolve(tokenResponse.access_token);
          } else {
            resolve(null);
          }
        },
        error_callback: (err: any) => {
          if (done) return;
          done = true;
          clearTimeout(timeoutId);
          isRefreshing = false;
          console.warn('[GoogleDriveAuth] Autorización omitida o cancelada por el usuario:', err?.message || err);
          resolve(null);
        },
      });

      const requestConfig: any = { prompt: '' };
      if (hint) {
        requestConfig.hint = hint;
      }
      client.requestAccessToken(requestConfig);
    } catch (err) {
      isRefreshing = false;
      resolve(null);
    }
  });
}

let heartbeatTimer: any = null;

/**
 * Heartbeat periódico para mantener el token de Google Drive vivo
 * Sincroniza desde la nube cada 3 minutos en segundo plano SIN lanzar popups.
 */
export function startTokenHeartbeat(): void {
  if (typeof window === 'undefined' || heartbeatTimer) return;

  const checkAndRenew = async () => {
    const sessionToken = window.sessionStorage.getItem('gdrive_bearer_token');
    const localToken = window.localStorage.getItem('gdrive_bearer_token') || window.localStorage.getItem('radiostream_drive_token');
    const token = sessionToken || localToken;
    if (!token) return;

    const expiresAt = parseInt(
      window.sessionStorage.getItem('gdrive_token_expires_at') ||
      window.localStorage.getItem('gdrive_token_expires_at') ||
      window.localStorage.getItem('radiostream_drive_token_expiry') || '0',
      10
    );

    // Si faltan menos de 25 minutos o ya expiró, sincronizar silenciosamente desde Firestore
    if (expiresAt > 0 && Date.now() >= (expiresAt - 25 * 60 * 1000)) {
      await syncTokenFromCloud();
    }
  };

  // Comprobar a los 10 segundos del arranque y luego cada 3 minutos
  setTimeout(checkAndRenew, 10000);
  heartbeatTimer = setInterval(checkAndRenew, 3 * 60 * 1000);
}

/**
 * Comprueba si el token OAuth de Google Drive almacenado ha caducado (o está a punto de caducar en <30s)
 */
export function isStoredTokenExpired(): boolean {
  if (typeof window === 'undefined') return true;
  const token = window.sessionStorage.getItem('gdrive_bearer_token') ||
                window.localStorage.getItem('gdrive_bearer_token') ||
                window.localStorage.getItem('radiostream_drive_token');
  if (!token) return true;

  const expiresAtStr =
    window.sessionStorage.getItem('gdrive_token_expires_at') ||
    window.localStorage.getItem('gdrive_token_expires_at') ||
    window.localStorage.getItem('radiostream_drive_token_expiry');
  if (!expiresAtStr) return false;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || expiresAt <= 0) return false;
  return Date.now() >= (expiresAt - 30 * 1000);
}

/**
 * Comprueba si Google Drive tiene una sesión persistente o biblioteca en caché disponible
 */
export function isDriveConnectedPersistently(): boolean {
  if (typeof window === 'undefined') return false;
  const token = getStoredAccessToken(false);
  if (token && !isStoredTokenExpired()) return true;

  const hasPaired = !!window.localStorage.getItem('radiostream_paired_user');
  const hasCachedLib = !!window.localStorage.getItem('radiostream_drive_library_cache');
  return hasPaired || hasCachedLib;
}

/**
 * Recupera el token en memoria para las peticiones binarias GET /files/{fileId}?alt=media
 * Lectura pura sin efectos secundarios ni lanzamientos automáticos de popups.
 * @param checkExpiry Si es true (por defecto), retorna null si el token ya caducó para evitar HTTP 401
 */
export function getStoredAccessToken(checkExpiry = true): string | null {
  if (typeof window === 'undefined') return null;

  if (checkExpiry && isStoredTokenExpired()) {
    return null;
  }

  const sessionToken = window.sessionStorage.getItem('gdrive_bearer_token');
  const localToken = window.localStorage.getItem('gdrive_bearer_token') || window.localStorage.getItem('radiostream_drive_token');
  const token = sessionToken || localToken;

  if (!token) return null;

  // Si tenemos token en localStorage pero no en sessionStorage, sincronizarlo en memoria
  if (localToken && !sessionToken) {
    try {
      window.sessionStorage.setItem('gdrive_bearer_token', localToken);
      const expiresAt = window.localStorage.getItem('gdrive_token_expires_at');
      if (expiresAt) {
        window.sessionStorage.setItem('gdrive_token_expires_at', expiresAt);
      }
    } catch {}
  }

  return token;
}

/**
 * Limpia los tokens de acceso caducados o tras cierre de sesión del usuario
 */
export function clearStoredAccessToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem('gdrive_bearer_token');
    window.sessionStorage.removeItem('gdrive_token_expires_at');
    window.localStorage.removeItem('gdrive_bearer_token');
    window.localStorage.removeItem('gdrive_token_expires_at');
    window.localStorage.removeItem('radiostream_drive_token');
    window.localStorage.removeItem('radiostream_drive_token_expiry');
  } catch {}
}

/**
 * Guarda explícitamente un token nuevo (por ejemplo desde emparejamiento con el móvil o renovación)
 */
export function storeAccessToken(token: string, expiresInSec: number = 3600): void {
  if (typeof window === 'undefined' || !token) return;
  const expiresAt = Date.now() + expiresInSec * 1000;
  try {
    window.sessionStorage.setItem('gdrive_bearer_token', token);
    window.sessionStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
    window.localStorage.setItem('gdrive_bearer_token', token);
    window.localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
    window.localStorage.setItem('radiostream_drive_token', token);
    window.localStorage.setItem('radiostream_drive_token_expiry', expiresAt.toString());
  } catch {}
}

