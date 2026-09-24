/**
 * Tesla & Vehicle Background Audio Keeper Service
 * 
 * Specifically designed for Tesla in-car browser (Chromium on Tesla OS/MCU)
 * and mobile/embedded browsers to prevent:
 * 1. Chromium Background Tab Freezing / Tab Discarding when the browser is minimized
 *    (e.g., driver navigates to Tesla Maps, Rear Camera, Car Settings, or Spotify).
 * 2. Intensive Timer Throttling: Chromium throttles background timers down to 1 execution
 *    every 60 seconds. A Blob-based Web Worker heartbeat runs on an isolated OS thread,
 *    guaranteeing reliable 1-second ticks even after hours in the background.
 * 3. Silent Audio Anchor: An inaudible looping audio stream keeps Chromium's media pipeline
 *    flagged as `hasAudioOutput = true`, making it immune to Tesla's aggressive background tab reaper.
 * 4. Visibility Auto-Recovery: Seamlessly recovers any stalled stream when the driver switches
 *    back to the browser.
 * 5. Screen Wake Lock: Keeps the car display alive and high-performing while in view.
 */

type HeartbeatCallback = () => void;

class TeslaBackgroundService {
  private silentAudio: HTMLAudioElement | null = null;
  private worker: Worker | null = null;
  private heartbeatCallbacks: Set<HeartbeatCallback> = new Set();
  private isKeepAliveActive = false;
  private wakeLock: any = null;
  private isInitialized = false;

  // Ultra-lightweight valid 44-byte RIFF WAV silence data URI
  private readonly SILENT_WAV =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';

  constructor() {
    if (typeof window !== 'undefined') {
      this.initVisibilityListener();
    }
  }

  /**
   * Initializes background listeners and registers lifecycle hooks
   */
  public init() {
    if (this.isInitialized || typeof window === 'undefined') return;
    this.isInitialized = true;
    this.initWorker();
    this.requestWakeLock();
  }

  /**
   * Spawns an inline Blob Web Worker that sends ticks every 1000ms.
   * Web Worker timers run on a separate OS thread and are NEVER throttled
   * by Chromium's background tab timer clamping (which normally clamps to 60s).
   */
  private initWorker() {
    if (this.worker || typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      const workerScript = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(function() {
                self.postMessage('tick');
              }, 1000);
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e) => {
        if (e.data === 'tick') {
          this.heartbeatCallbacks.forEach((cb) => {
            try {
              cb();
            } catch (err) {
              console.warn('[TeslaBackground] Heartbeat callback error:', err);
            }
          });
        }
      };

      if (this.isKeepAliveActive) {
        this.worker.postMessage('start');
      }
    } catch (e) {
      console.warn('[TeslaBackground] Web Worker not supported or restricted, falling back to window timer:', e);
    }
  }

  /**
   * Registers a callback to be called every second even when the tab is minimized in Tesla.
   */
  public registerHeartbeat(callback: HeartbeatCallback): () => void {
    this.heartbeatCallbacks.add(callback);
    return () => {
      this.heartbeatCallbacks.delete(callback);
    };
  }

  /**
   * Starts the Background Keep-Alive anchor.
   * Call whenever audio starts playing (Radio or Google Drive).
   */
  public startKeepAlive() {
    this.init();
    this.isKeepAliveActive = true;

    if (this.worker) {
      this.worker.postMessage('start');
    }

    // Do NOT play silent audio concurrently while real audio (radio or drive) is actively playing.
    // The active audio element already keeps Chromium's media pipeline alive (hasAudioOutput = true).
    // Playing two audio elements concurrently confuses car sound mixers (PulseAudio/ALSA) and
    // causes dual-stream conflicts.
    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
      } catch {}
    }
    this.requestWakeLock();
  }

  /**
   * Stops the background anchor when all playback stops.
   */
  public stopKeepAlive() {
    this.isKeepAliveActive = false;

    if (this.worker) {
      this.worker.postMessage('stop');
    }

    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
        this.silentAudio.src = '';
        this.silentAudio = null;
      } catch {
        // ignore
      }
    }

    this.releaseWakeLock();
  }

  /**
   * Plays an inaudible audio loop.
   * In Chromium's TabLifecycleUnit, having an active playing audio element
   * prevents the tab from ever entering the `DISCARDED` or `FROZEN` state.
   */
  private playSilentAnchor() {
    if (typeof window === 'undefined') return;

    try {
      if (!this.silentAudio) {
        const audio = new Audio();
        audio.src = this.SILENT_WAV;
        audio.loop = true;
        audio.volume = 0.001; // Inaudible, but flags Chromium's media pipeline as active
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.setAttribute('x-webkit-airplay', 'allow');
        this.silentAudio = audio;
      }

      if (this.silentAudio.paused) {
        const p = this.silentAudio.play();
        if (p !== undefined) {
          p.catch(() => {
            // Will activate upon first user tap
          });
        }
      }
    } catch (e) {
      console.warn('[TeslaBackground] Could not start silent audio anchor:', e);
    }
  }

  /**
   * Screen Wake Lock management (prevents MCU screen sleeping while in foreground)
   */
  public async requestWakeLock() {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !this.wakeLock) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      } catch {
        // WakeLock may be rejected if tab is already hidden or battery policy
      }
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
      } catch {
        // ignore
      }
      this.wakeLock = null;
    }
  }

  /**
   * Handles visibility changes (minimized vs restored)
   */
  private initVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Tab minimized in Tesla (e.g. Navigation opened)
        if (this.isKeepAliveActive) {
          console.log('[TeslaBackground] Navegador minimizado en Tesla. Asegurando ancla de audio...');
          this.playSilentAnchor();
        }
      } else if (document.visibilityState === 'visible') {
        // Tab restored to view in Tesla
        console.log('[TeslaBackground] Navegador restaurado a primer plano en Tesla.');
        this.requestWakeLock();
      }
    });
  }

  public isRunning(): boolean {
    return this.isKeepAliveActive;
  }
}

export const teslaBackgroundService = new TeslaBackgroundService();
