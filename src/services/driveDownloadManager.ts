import { getStoredAccessToken, clearStoredAccessToken, trySilentTokenRefresh, syncTokenFromCloud } from './googleDriveAuth';
import { audioCarTelemetry } from './audioCarTelemetry';

export interface ActiveTrackResource {
  fileId: string;
  blobUrl: string;
  blobSize: number;
}

export class DriveDownloadManager {
  private activeUrl: string | null = null;
  private preloadedUrl: string | null = null;
  private preloadedFileId: string | null = null;

  // Parámetros de Backoff Exponencial optimizados para evitar bloqueos
  private readonly MAX_RETRIES = 2;
  private readonly INITIAL_BACKOFF_MS = 400;
  private readonly MAX_BACKOFF_MS = 2500;

  /**
   * Descarga binaria con mitigación estricta de cuotas, soporte de cancelación AbortSignal y retry rápido
   */
  public async fetchDriveMediaBinary(fileId: string, accessToken?: string, signal?: AbortSignal): Promise<Blob> {
    if (signal?.aborted) {
      const abortErr: any = new Error('[DriveAPI] Descarga cancelada');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    let effectiveToken = accessToken || getStoredAccessToken(true) || '';

    if (!effectiveToken) {
      // Intentar refresco silencioso si no hay token disponible
      const refreshed = await trySilentTokenRefresh(undefined, true).catch(() => null);
      effectiveToken = refreshed || getStoredAccessToken(true) || '';
    }

    if (!effectiveToken) {
      const err: any = new Error('[DriveAPI] No hay token de autenticación disponible para descargar el archivo.');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }

    const endpoint = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`;
    let attempt = 0;

    while (attempt <= this.MAX_RETRIES) {
      if (signal?.aborted) {
        const abortErr: any = new Error('[DriveAPI] Descarga cancelada');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${effectiveToken}`,
          },
          signal,
        });

        if (response.ok) {
          return await response.blob();
        }

        if (response.status === 401) {
          console.warn('[DriveAPI] Token 401 detectado, intentando refresco silencioso...');
          clearStoredAccessToken();
          let refreshedToken = await syncTokenFromCloud().catch(() => null);
          if (!refreshedToken) {
            refreshedToken = await trySilentTokenRefresh(undefined, true).catch(() => null);
          }
          if (refreshedToken) {
            effectiveToken = refreshedToken;
            console.log('[DriveAPI] Token renovado tras 401, reintentando descarga...');
            const retryRes = await fetch(endpoint, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
              signal,
            });
            if (retryRes.ok) {
              return await retryRes.blob();
            }
          }
          console.warn('[DriveAPI] Token no disponible (401). Se requiere renovación por parte del usuario.');
          const err: any = new Error('[DriveAPI] Token expirado o temporalmente no disponible (HTTP 401).');
          err.code = 'TOKEN_EXPIRED';
          throw err;
        }

        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          if (response.status === 429) {
            audioCarTelemetry.recordNetworkThrottling();
          }
          attempt++;
          if (attempt > this.MAX_RETRIES) {
            throw new Error(`[DriveDownloadManager] Cuota excedida (HTTP ${response.status}).`);
          }
          const backoff = Math.min(
            this.MAX_BACKOFF_MS,
            this.INITIAL_BACKOFF_MS * Math.pow(2, attempt)
          );
          const jitter = backoff * (0.8 + Math.random() * 0.4);
          console.warn(`[DriveAPI] HTTP ${response.status}. Reintento ${attempt}/${this.MAX_RETRIES} en ${Math.round(jitter)}ms`);
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }

        throw new Error(`[DriveAPI] Error HTTP fatal: ${response.status} ${response.statusText}`);
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError') throw err;
        if (err?.code === 'TOKEN_EXPIRED') throw err;
        if (attempt >= this.MAX_RETRIES) throw err;
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }

    throw new Error('[DriveDownloadManager] No se pudo obtener el archivo tras reintentos.');
  }

  /**
   * Salvaguarda 2: Techo de RAM Estricto (Máximo 2 Blob URLs simultáneos)
   */
  public registerActivePlayback(fileId: string, blob: Blob): string {
    // Si la pista actual ya estaba precargada, promuévela
    if (this.preloadedFileId === fileId && this.preloadedUrl) {
      if (this.activeUrl && this.activeUrl !== this.preloadedUrl) {
        try {
          URL.revokeObjectURL(this.activeUrl);
          audioCarTelemetry.recordBlobRevocation();
        } catch {}
      }
      this.activeUrl = this.preloadedUrl;
      this.preloadedUrl = null;
      this.preloadedFileId = null;
      return this.activeUrl;
    }

    // Si entra una pista nueva por salto directo, purgar la activa previa
    if (this.activeUrl) {
      try {
        URL.revokeObjectURL(this.activeUrl);
        audioCarTelemetry.recordBlobRevocation();
      } catch {}
      this.activeUrl = null;
    }

    this.activeUrl = URL.createObjectURL(blob);
    audioCarTelemetry.recordBlobCreation(fileId);
    return this.activeUrl;
  }

  public registerPreloadedTrack(fileId: string, blob: Blob): string {
    // Si ya existía una pista precargada que no se usó (ej. el usuario cambió de opinión), liberarla
    if (this.preloadedUrl) {
      try {
        URL.revokeObjectURL(this.preloadedUrl);
        audioCarTelemetry.recordBlobRevocation(this.preloadedFileId || undefined);
      } catch {}
      this.preloadedUrl = null;
      this.preloadedFileId = null;
    }

    this.preloadedUrl = URL.createObjectURL(blob);
    this.preloadedFileId = fileId;
    audioCarTelemetry.recordBlobCreation(fileId);
    return this.preloadedUrl;
  }

  public purgeAllBlobs(): void {
    if (this.activeUrl) {
      try {
        URL.revokeObjectURL(this.activeUrl);
        audioCarTelemetry.recordBlobRevocation();
      } catch {}
      this.activeUrl = null;
    }
    if (this.preloadedUrl) {
      try {
        URL.revokeObjectURL(this.preloadedUrl);
        audioCarTelemetry.recordBlobRevocation(this.preloadedFileId || undefined);
      } catch {}
      this.preloadedUrl = null;
      this.preloadedFileId = null;
    }
  }

  /**
   * Salvaguarda 1: Verificador de Lazy Buffering (Anti-Skip de 10s / 25%)
   */
  public canPreloadNext(currentTime: number, duration: number): boolean {
    if (!duration || duration <= 0) return false;
    const pastTenSeconds = currentTime >= 10;
    const pastTwentyFivePercent = (currentTime / duration) >= 0.25;
    return pastTenSeconds || pastTwentyFivePercent;
  }

  public getActiveUrl(): string | null {
    return this.activeUrl;
  }

  public getPreloadedUrl(): string | null {
    return this.preloadedUrl;
  }

  public getPreloadedFileId(): string | null {
    return this.preloadedFileId;
  }

  public hasPreloaded(fileId: string): boolean {
    return this.preloadedFileId === fileId && !!this.preloadedUrl;
  }
}

export const driveDownloadManager = new DriveDownloadManager();
