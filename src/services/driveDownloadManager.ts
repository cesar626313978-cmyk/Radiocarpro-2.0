export interface ActiveTrackResource {
  fileId: string;
  blobUrl: string;
  blobSize: number;
}

export class DriveDownloadManager {
  private activeUrl: string | null = null;
  private preloadedUrl: string | null = null;
  private preloadedFileId: string | null = null;

  // Parámetros de Backoff Exponencial
  private readonly MAX_RETRIES = 5;
  private readonly INITIAL_BACKOFF_MS = 1000;
  private readonly MAX_BACKOFF_MS = 32000;

  /**
   * Descarga binaria con mitigación estricta de cuotas y retry con jitter
   */
  public async fetchDriveMediaBinary(fileId: string, accessToken: string): Promise<Blob> {
    const endpoint = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`;
    let attempt = 0;

    while (attempt < this.MAX_RETRIES) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          return await response.blob();
        }

        if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
          attempt++;
          if (attempt >= this.MAX_RETRIES) {
            throw new Error(`[DriveDownloadManager] Cuota excedida (HTTP ${response.status}). Reintentos agotados.`);
          }
          const backoff = Math.min(
            this.MAX_BACKOFF_MS,
            this.INITIAL_BACKOFF_MS * Math.pow(2, attempt)
          );
          // Jitter aleatorio uniforme ± 20%
          const jitter = backoff * (0.8 + Math.random() * 0.4);
          console.warn(`[DriveAPI] HTTP ${response.status}. Reintento ${attempt}/${this.MAX_RETRIES} en ${Math.round(jitter)}ms`);
          await new Promise((resolve) => setTimeout(resolve, jitter));
          continue;
        }

        throw new Error(`[DriveAPI] Error HTTP fatal: ${response.status} ${response.statusText}`);
      } catch (err) {
        if (attempt >= this.MAX_RETRIES - 1) throw err;
        attempt++;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    throw new Error('[DriveDownloadManager] No se pudo obtener el archivo tras múltiples intentos.');
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
      } catch {}
      this.activeUrl = null;
    }

    this.activeUrl = URL.createObjectURL(blob);
    return this.activeUrl;
  }

  public registerPreloadedTrack(fileId: string, blob: Blob): string {
    // Si ya existía una pista precargada que no se usó (ej. el usuario cambió de opinión), liberarla
    if (this.preloadedUrl) {
      try {
        URL.revokeObjectURL(this.preloadedUrl);
      } catch {}
      this.preloadedUrl = null;
      this.preloadedFileId = null;
    }

    this.preloadedUrl = URL.createObjectURL(blob);
    this.preloadedFileId = fileId;
    return this.preloadedUrl;
  }

  public purgeAllBlobs(): void {
    if (this.activeUrl) {
      try {
        URL.revokeObjectURL(this.activeUrl);
      } catch {}
      this.activeUrl = null;
    }
    if (this.preloadedUrl) {
      try {
        URL.revokeObjectURL(this.preloadedUrl);
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
