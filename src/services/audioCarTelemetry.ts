/**
 * Monitor de Telemetría y Salud del Motor de Audio (Audio-Car Beta)
 */

export interface TelemetryMetrics {
  blobUrlsAllocated: number;
  blobUrlsRevoked: number;
  activeBlobsInRam: number;
  quotaErrorsCaught: number;
  networkThrottlingEvents: number;
}

export interface TelemetrySnapshot {
  timestamp: string;
  userAgent: string;
  metrics: TelemetryMetrics;
  isOnline: boolean;
  memory: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  } | string;
}

export class AudioCarTelemetry {
  public logs: any[];
  public metrics: TelemetryMetrics;

  constructor() {
    this.logs = [];
    this.metrics = {
      blobUrlsAllocated: 0,
      blobUrlsRevoked: 0,
      activeBlobsInRam: 0,
      quotaErrorsCaught: 0,
      networkThrottlingEvents: 0
    };
  }

  public recordBlobCreation(fileId?: string): void {
    this.metrics.blobUrlsAllocated++;
    this.metrics.activeBlobsInRam++;
    this._assertMemoryCeiling();
  }

  public recordBlobRevocation(fileId?: string): void {
    this.metrics.blobUrlsRevoked++;
    this.metrics.activeBlobsInRam = Math.max(0, this.metrics.activeBlobsInRam - 1);
  }

  public recordQuotaExceeded(): void {
    this.metrics.quotaErrorsCaught++;
    console.warn('[Telemetry] QuotaExceededError mitigado por LRU en almacenamiento local.');
  }

  public recordNetworkThrottling(): void {
    this.metrics.networkThrottlingEvents++;
  }

  public _assertMemoryCeiling(): void {
    // Salvaguarda 2: Alerta si el heap retiene más de 2 Blob URLs vivas
    if (this.metrics.activeBlobsInRam > 2) {
      console.error(
        `[Telemetry Warning] Infracción de Techo de RAM: ${this.metrics.activeBlobsInRam} Blobs activos en heap.`
      );
    }
  }

  public getSnapshot(): TelemetrySnapshot {
    const memory = (typeof performance !== 'undefined' && (performance as any).memory) ? {
      jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit,
      totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
      usedJSHeapSize: (performance as any).memory.usedJSHeapSize
    } : 'No disponible (navegador no Chromium)';

    return {
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
      metrics: { ...this.metrics },
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      memory
    };
  }
}

export const audioCarTelemetry = new AudioCarTelemetry();

// Exponer en window para diagnósticos de consola en modo desarrollo / pruebas en vehículo
if (typeof window !== 'undefined') {
  (window as any).audioCarTelemetry = audioCarTelemetry;
}
