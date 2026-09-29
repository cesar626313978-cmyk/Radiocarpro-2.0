/**
 * Módulo de Autenticación OAuth 2.0 (Google Identity Services)
 * Audio-Car Production - Dominio Canónico: https://www.audio-car.es/
 */

// Fallback robusto: lee de variable de entorno (Vite) o usa el ID de producción directo
export const GOOGLE_CLIENT_ID: string = 
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) ||
  '1094273500016-v1jtdlpm11qhdk1vdbmo1g2o0469r464.apps.googleusercontent.com';

export const OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

let tokenClient: any = null;

declare global {
  interface Window {
    google?: any;
  }
}

/**
 * Inicializa el cliente GIS una vez cargado el script https://accounts.google.com/gsi/client
 */
export function initGoogleAuth(
  onTokenReceived?: (token: string) => void,
  onError?: (error: any) => void
): any {
  if (typeof window === 'undefined' || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    console.error('[Auth] SDK de Google Identity Services no disponible en window.');
    return null;
  }

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: OAUTH_SCOPE,
    callback: (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        // Almacenamiento seguro transitorio en memoria de sesión
        window.sessionStorage.setItem('gdrive_bearer_token', tokenResponse.access_token);
        
        // Calcular expiración aproximada (GIS devuelve expiresIn en segundos, habitualmente 3599)
        const expiresInSec = parseInt(tokenResponse.expires_in, 10) || 3600;
        const expiresAt = Date.now() + expiresInSec * 1000;
        window.sessionStorage.setItem('gdrive_token_expires_at', expiresAt.toString());

        // Respaldo resiliente en localStorage para navegación y refrescos de página
        try {
          window.localStorage.setItem('gdrive_bearer_token', tokenResponse.access_token);
          window.localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
          window.localStorage.setItem('radiostream_drive_token', tokenResponse.access_token);
          window.localStorage.setItem('radiostream_drive_token_expiry', expiresAt.toString());
        } catch {}

        if (typeof onTokenReceived === 'function') {
          onTokenReceived(tokenResponse.access_token);
        }
      } else {
        console.error('[Auth] Respuesta OAuth sin token de acceso:', tokenResponse);
        if (typeof onError === 'function') {
          onError(new Error('[Auth] Respuesta sin token de acceso'));
        }
      }
    },
    error_callback: (error: any) => {
      console.error('[Auth Error]:', error);
      if (typeof onError === 'function') {
        onError(error);
      }
    }
  });

  return tokenClient;
}

/**
 * Solicita o refresca el token de acceso mostrando el diálogo oficial de Google
 */
export function requestGoogleAccessToken(promptType: string = ''): void {
  if (!tokenClient) {
    initGoogleAuth();
  }
  if (!tokenClient) {
    throw new Error('[Auth] El cliente OAuth no ha sido inicializado. Ejecuta initGoogleAuth() primero.');
  }
  // Abre el flujo interactivo de consentimiento
  tokenClient.requestAccessToken({ prompt: promptType });
}

/**
 * Recupera el token en memoria para las peticiones binarias GET /files/{fileId}?alt=media
 */
export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = window.sessionStorage.getItem('gdrive_bearer_token');
  const expiresAt = parseInt(window.sessionStorage.getItem('gdrive_token_expires_at') || '0', 10);

  // Considerar caducado si faltan menos de 60 segundos
  if (token && (expiresAt === 0 || Date.now() < (expiresAt - 60000))) {
    return token;
  }

  // Comprobar respaldo en localStorage si la memoria de sesión fue reciclada
  try {
    const localToken = window.localStorage.getItem('gdrive_bearer_token') || window.localStorage.getItem('radiostream_drive_token');
    const localExpires = parseInt(window.localStorage.getItem('gdrive_token_expires_at') || window.localStorage.getItem('radiostream_drive_token_expiry') || '0', 10);
    if (localToken && (localExpires === 0 || Date.now() < (localExpires - 60000))) {
      // Re-sincronizar sessionStorage
      window.sessionStorage.setItem('gdrive_bearer_token', localToken);
      if (localExpires > 0) {
        window.sessionStorage.setItem('gdrive_token_expires_at', localExpires.toString());
      }
      return localToken;
    }
  } catch {}

  return null;
}

/**
 * Limpia todos los tokens almacenados tras cierre de sesión o error 401
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
 * Guarda explícitamente un token nuevo (por ejemplo desde emparejamiento con el móvil)
 */
export function storeAccessToken(token: string, expiresInSec: number = 3600): void {
  if (typeof window === 'undefined') return;
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
