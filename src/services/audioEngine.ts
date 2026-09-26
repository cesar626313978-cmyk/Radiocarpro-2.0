import { PlaybackStatus } from '../types/radio';
import { teslaBackgroundService } from './teslaBackgroundService';

/**
 * High-performance, Resilient Audio Engine for live internet radio streams in vehicles.
 * Specially engineered for car environments (Tesla, mobile data):
 * - Tesla Background Keep-Alive: Prevents Chromium tab discarding and timer freezing when minimized.
 * - Anti-Dropout Auto-Recovery: Handles cellular coverage drops, tunnel transit, and cell handoffs.
 * - Automatic reconnection with progressive exponential backoff (up to 15 attempts, >2.5 minutes).
 * - Silent stall/freeze watchdog driven by Web Worker background heartbeat.
 * - Native window.online & visibilitychange wake-up: Resumes playback instantly.
 * - MediaSession playbackState synchronization for Tesla MPRIS & steering wheel scroll wheels.
 * - Cache-busting stream reconnects: Bypasses stale cellular proxy/gateway caches.
 * - Web Audio API real-time frequency analysis.
 */
class RadioAudioEngine {
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private audioSourceNode: MediaElementAudioSourceNode | null = null;
  private volume = 0.8;
  private targetVolume = 0.8;
  private fadeInterval: number | null = null;
  private connectionTimeoutTimer: number | null = null;
  private status: PlaybackStatus = 'idle';
  private statusListeners: Array<(status: PlaybackStatus, errorMsg?: string) => void> = [];

  // Vehicle Anti-Dropout & Reconnection State
  private currentStreamUrl = '';
  private shouldBePlaying = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 15;
  private reconnectTimer: number | null = null;
  private freezeWatchdogTimer: number | null = null;
  private unregisterHeartbeat: (() => void) | null = null;
  private lastAudioPosition = -1;
  private lastProgressTimestamp = Date.now();
  private waitingDebounceTimer: number | null = null;
  private stallCount = 0;
  private bufferSize = '128KB';

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('radiostream_buffer_size');
        if (saved && ['64KB', '128KB', '256KB', '512KB'].includes(saved)) {
          this.bufferSize = saved;
        }
      } catch {}
    }
    // Listen to global network online/offline and visibility transitions in Tesla
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.shouldBePlaying && this.status === 'error') {
          console.log('[RadioAudioEngine] Conexión recuperada (Online). Intentando sintonizar nuevamente tras error...');
          this.cancelReconnectTimer();
          this.reconnectAttempts = 0;
          this.executeConnection(true);
        }
      });

      window.addEventListener('offline', () => {
        // Let HTML5 audio handle temporary cellular drops using its own internal buffer.
        // If it genuinely runs out of bytes, onwaiting will transition the UI smoothly.
        console.log('[RadioAudioEngine] Red móvil desconectada temporalmente en movimiento. Manteniendo reproducción desde búfer...');
      });

      // When the driver switches back to the browser from Tesla Maps / Settings / Spotify
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.shouldBePlaying) {
          this.initAudioContext();
          if (this.audio) {
            if (this.audio.paused || this.status === 'error') {
              console.log('[RadioAudioEngine] Pantalla restaurada en Tesla. Recuperando flujo detenido o fallido...');
              this.cancelReconnectTimer();
              this.executeConnection(true);
            }
          }
        }
      });
    }
  }

  private setStatus(newStatus: PlaybackStatus, errorMsg?: string) {
    this.status = newStatus;

    // Synchronize native MediaSession playbackState for Tesla MCU & steering wheel
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      if (newStatus === 'playing') {
        navigator.mediaSession.playbackState = 'playing';
      } else if (newStatus === 'buffering') {
        // Keep as playing in MediaSession so Tesla doesn't think audio stopped and kill the tab
        navigator.mediaSession.playbackState = 'playing';
      } else if (newStatus === 'idle' || newStatus === 'error') {
        navigator.mediaSession.playbackState = 'none';
      }
    }

    // Tesla background keepalive anchor: maintains hasAudioOutput flag
    if (newStatus === 'playing') {
      teslaBackgroundService.startKeepAlive();
    } else if (newStatus === 'idle' || newStatus === 'error') {
      teslaBackgroundService.stopKeepAlive();
    }

    this.statusListeners.forEach(listener => {
      try {
        listener(newStatus, errorMsg);
      } catch (err) {
        console.error('Status listener error:', err);
      }
    });
  }

  public onStatusChange(callback: (status: PlaybackStatus, errorMsg?: string) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  public getStatus(): PlaybackStatus {
    return this.status;
  }

  private initAudioContext() {
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 64;
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  private ensureAudioElement(): HTMLAudioElement {
    if (!this.audio) {
      const audio = new Audio();
      this.audio = audio;
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.volume = this.volume;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.setAttribute('x-webkit-airplay', 'allow');

      // Connect Web Audio Analyser once for the audio element
      try {
        if (this.audioContext && this.analyser && !this.audioSourceNode) {
          this.audioSourceNode = this.audioContext.createMediaElementSource(audio);
          this.audioSourceNode.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
        }
      } catch {
        // Cross-origin restriction or already hooked
      }

      // Buffer & Event Listeners
      audio.ontimeupdate = () => {
        this.lastProgressTimestamp = Date.now();
        this.stallCount = 0;
      };

      audio.onprogress = () => {
        this.lastProgressTimestamp = Date.now();
      };

      audio.onwaiting = () => {
        if (this.shouldBePlaying && this.status === 'playing') {
          if (this.waitingDebounceTimer !== null) {
            window.clearTimeout(this.waitingDebounceTimer);
          }
          // Debounce 1500ms so cellular fluctuations do not flicker status or reload stream
          this.waitingDebounceTimer = window.setTimeout(() => {
            if (this.shouldBePlaying && this.status === 'playing' && this.audio && !this.audio.paused) {
              this.setStatus('buffering', 'Cargando búfer de señal...');
            }
          }, 1500);
        }
      };

      audio.onstalled = () => {
        // NOTE: On live HTTP streams, Chromium fires 'stalled' normally when its internal
        // buffer is full and TCP socket read is temporarily paused.
        // DO NOT reconnect or toggle status to buffering on 'stalled', as this causes
        // the playback to stutter and reload every few seconds!
        this.lastProgressTimestamp = Date.now();
      };

      audio.onplaying = () => {
        if (this.waitingDebounceTimer !== null) {
          window.clearTimeout(this.waitingDebounceTimer);
          this.waitingDebounceTimer = null;
        }
        if (this.shouldBePlaying) {
          this.clearConnectionTimeout();
          this.cancelReconnectTimer();
          this.reconnectAttempts = 0;
          this.stallCount = 0;
          this.lastAudioPosition = audio.currentTime;
          this.lastProgressTimestamp = Date.now();
          this.setStatus('playing');
        }
      };

      audio.onerror = () => {
        if (this.shouldBePlaying) {
          console.warn('[RadioAudioEngine] Error de señal/socket. Intentando reconexión automática...');
          this.clearConnectionTimeout();
          this.scheduleAutoReconnect();
        }
      };
    }
    return this.audio;
  }

  public playStream(
    url: string,
    onPlaying?: () => void,
    onError?: (msg?: string) => void,
    onBuffering?: () => void
  ) {
    this.currentStreamUrl = url;
    this.shouldBePlaying = true;
    this.reconnectAttempts = 0;
    this.stallCount = 0;
    this.cancelReconnectTimer();

    this.initAudioContext();
    this.setStatus('buffering', 'Conectando con la emisora...');
    if (onBuffering) onBuffering();

    this.executeConnection(false, onPlaying, onError);
    this.startFreezeWatchdog();
  }

  private executeConnection(
    isRetry = false,
    onPlaying?: () => void,
    onError?: (msg?: string) => void
  ) {
    if (!this.shouldBePlaying || !this.currentStreamUrl) return;

    this.clearConnectionTimeout();
    const audio = this.ensureAudioElement();

    // Cache-busting URL to force fresh live stream socket on cellular networks
    let targetUrl = this.currentStreamUrl;
    if (isRetry) {
      const sep = targetUrl.includes('?') ? '&' : '?';
      targetUrl = `${targetUrl}${sep}_car_retry=${Date.now()}`;
    }

    try {
      audio.src = targetUrl;
      audio.volume = this.volume;
      audio.load();
    } catch (e) {
      console.warn('[RadioAudioEngine] Error asignando src a audio:', e);
    }

    // Vehicle Connection Timeout (9s per attempt)
    this.connectionTimeoutTimer = window.setTimeout(() => {
      if (this.shouldBePlaying && this.status !== 'playing') {
        console.warn(`[RadioAudioEngine] Intento de conexión agotado (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        this.scheduleAutoReconnect(onError);
      }
    }, 9000);

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          if (this.shouldBePlaying) {
            this.clearConnectionTimeout();
            this.cancelReconnectTimer();
            this.reconnectAttempts = 0;
            this.setStatus('playing');
            if (onPlaying) onPlaying();
          }
        })
        .catch(err => {
          if (err.name === 'AbortError') return; // User paused or navigated
          console.warn('[RadioAudioEngine] Play promise rechazado:', err.message);
          this.scheduleAutoReconnect(onError);
        });
    }
  }

  private scheduleAutoReconnect(onError?: (msg?: string) => void) {
    if (!this.shouldBePlaying || this.reconnectTimer !== null) return;
    this.clearConnectionTimeout();

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[RadioAudioEngine] Límite de reconexiones alcanzado sin señal.');
      this.setStatus('error', 'Sin señal de cobertura tras varios intentos');
      if (onError) onError('Sin señal de cobertura');
      return;
    }

    this.reconnectAttempts++;
    // Progressive backoff: 1.2s, 2s, 3.2s, 4.5s, max 8s
    const delay = Math.min(8000, Math.floor(1200 * Math.pow(1.28, this.reconnectAttempts - 1)));
    this.setStatus('buffering', `Recuperando señal (Reintento ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldBePlaying) {
        console.log(`[RadioAudioEngine] Ejecutando reconexión automática #${this.reconnectAttempts}...`);
        this.executeConnection(true, undefined, onError);
      }
    }, delay);
  }

  private startFreezeWatchdog() {
    this.stopFreezeWatchdog();
    this.lastProgressTimestamp = Date.now();
    this.lastAudioPosition = this.audio ? this.audio.currentTime : -1;

    // Hook into Web Worker heartbeat to guarantee execution even when browser is minimized in the car
    this.unregisterHeartbeat = teslaBackgroundService.registerHeartbeat(() => {
      this.checkFreezeWatchdogTick();
    });
  }

  private checkFreezeWatchdogTick() {
    if (!this.shouldBePlaying || this.status !== 'playing' || !this.audio) return;

    // Do nothing if audio is intentionally paused or ended
    if (this.audio.paused || this.audio.ended) return;

    const currentPos = this.audio.currentTime;

    // If audio position has advanced or audio has enough data buffered, playback is healthy
    if (Math.abs(currentPos - this.lastAudioPosition) >= 0.1 || (this.audio.readyState >= 2 && !this.audio.paused)) {
      this.lastAudioPosition = currentPos;
      this.lastProgressTimestamp = Date.now();
      this.stallCount = 0;
      return;
    }

    // If position hasn't advanced, calculate freeze duration
    const freezeDuration = Date.now() - this.lastProgressTimestamp;

    // Only intervene if genuinely frozen with NO audio progress for at least 25 seconds
    // and the device is currently online
    if (freezeDuration > 25000 && (typeof navigator === 'undefined' || navigator.onLine)) {
      console.warn(`[RadioAudioEngine] Flujo congelado detectado (${Math.round(freezeDuration / 1000)}s sin avance). Reconectando...`);
      this.lastProgressTimestamp = Date.now();
      this.lastAudioPosition = -1;
      this.setStatus('buffering', 'Recuperando flujo de audio...');
      this.scheduleAutoReconnect();
    }
  }

  private stopFreezeWatchdog() {
    if (this.unregisterHeartbeat) {
      this.unregisterHeartbeat();
      this.unregisterHeartbeat = null;
    }
    if (this.freezeWatchdogTimer !== null) {
      clearInterval(this.freezeWatchdogTimer);
      this.freezeWatchdogTimer = null;
    }
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeoutTimer !== null) {
      window.clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
  }

  private cancelReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public stop() {
    this.shouldBePlaying = false;
    this.clearConnectionTimeout();
    this.cancelReconnectTimer();
    this.stopFreezeWatchdog();
    this.reconnectAttempts = 0;
    this.stallCount = 0;

    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.removeAttribute('src');
      this.audio.load();
    }
    this.setStatus('idle');
  }

  /**
   * Conmutación Limpia de Fuentes:
   * Detiene y desengancha completamente el stream de radio en vivo
   * antes de activar la pletina de Google Drive.
   */
  public cleanupAudio(): void {
    this.stop();
    console.log('[RadioAudioEngine] cleanupAudio: Stream de radio detenido y desenganchado.');
  }

  public pause() {
    this.shouldBePlaying = false;
    this.clearConnectionTimeout();
    this.cancelReconnectTimer();
    this.stopFreezeWatchdog();

    if (this.audio) {
      this.audio.pause();
    }
    this.setStatus('idle');
  }

  public resume(url?: string) {
    const targetUrl = url || this.currentStreamUrl;
    if (targetUrl) {
      this.playStream(targetUrl);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.targetVolume = this.volume;
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlaying(): boolean {
    return this.status === 'playing';
  }

  public startFadeOut(durationSeconds: number, onComplete?: () => void) {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    const startVol = this.volume;
    const steps = 30;
    const stepTime = (durationSeconds * 1000) / steps;
    const volStep = startVol / steps;
    let currentStep = 0;

    this.fadeInterval = window.setInterval(() => {
      currentStep++;
      const newVol = Math.max(0, startVol - volStep * currentStep);
      this.setVolume(newVol);

      if (currentStep >= steps || newVol <= 0.01) {
        if (this.fadeInterval) clearInterval(this.fadeInterval);
        this.stop();
        this.setVolume(this.targetVolume);
        if (onComplete) onComplete();
      }
    }, stepTime);
  }

  public cancelFadeOut() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.setVolume(this.targetVolume);
  }

  public getFrequencyData(): Uint8Array {
    if (!this.analyser || this.status !== 'playing') {
      return new Uint8Array(16).map(() => 0);
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }

  private nextStationCallback: (() => void) | null = null;
  private prevStationCallback: (() => void) | null = null;

  public setStationNavigationHandlers(next: () => void, prev: () => void) {
    this.nextStationCallback = next;
    this.prevStationCallback = prev;
    this.bindMediaSessionActions();
  }

  private bindMediaSessionActions() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          this.resume();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.pause();
        });
        navigator.mediaSession.setActionHandler('stop', () => {
          this.stop();
        });
        if (this.nextStationCallback) {
          navigator.mediaSession.setActionHandler('nexttrack', () => {
            if (this.nextStationCallback) this.nextStationCallback();
          });
        }
        if (this.prevStationCallback) {
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            if (this.prevStationCallback) this.prevStationCallback();
          });
        }
      } catch {
        // Some browser engines might not support all actions
      }
    }
  }

  public updateMediaMetadata(station: { name: string; genre?: string; logoUrl?: string; country?: string }) {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.genre ? `${station.genre} • En Directo` : 'En Directo',
        album: station.country || 'Myradio Pro 2.0',
        artwork: [
          { src: station.logoUrl || '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });

      this.bindMediaSessionActions();
    }
  }

  // Sleep Timer functionality
  private sleepTimerInterval: number | null = null;
  private sleepTimerSecondsRemaining = 0;
  private sleepTimerListeners: Array<(seconds: number) => void> = [];

  public setSleepTimer(minutes: number, fadeOutMinutes: number = 5) {
    this.cancelSleepTimer();
    if (minutes <= 0) return;

    const totalSeconds = minutes * 60;
    const fadeOutSeconds = Math.min(totalSeconds, fadeOutMinutes * 60);
    const fadeStartSecond = totalSeconds - fadeOutSeconds;

    this.sleepTimerSecondsRemaining = totalSeconds;
    this.sleepTimerListeners.forEach(l => l(this.sleepTimerSecondsRemaining));

    let fadeStarted = false;

    this.sleepTimerInterval = window.setInterval(() => {
      this.sleepTimerSecondsRemaining -= 1;
      this.sleepTimerListeners.forEach(l => l(this.sleepTimerSecondsRemaining));

      const elapsed = totalSeconds - this.sleepTimerSecondsRemaining;
      if (!fadeStarted && elapsed >= fadeStartSecond && fadeOutSeconds > 0) {
        fadeStarted = true;
        this.startFadeOut(fadeOutSeconds / 60);
      }

      if (this.sleepTimerSecondsRemaining <= 0) {
        this.cancelSleepTimer();
        this.stop();
      }
    }, 1000);
  }

  public cancelSleepTimer() {
    if (this.sleepTimerInterval !== null) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    this.sleepTimerSecondsRemaining = 0;
    this.sleepTimerListeners.forEach(l => l(0));
  }

  public getSleepTimerSeconds(): number {
    return this.sleepTimerSecondsRemaining;
  }

  public onSleepTimerChange(callback: (seconds: number) => void): () => void {
    this.sleepTimerListeners.push(callback);
    callback(this.sleepTimerSecondsRemaining);
    return () => {
      this.sleepTimerListeners = this.sleepTimerListeners.filter(cb => cb !== callback);
    };
  }

  public getBufferSize(): string {
    return this.bufferSize;
  }

  public setBufferSize(size: string): void {
    if (['64KB', '128KB', '256KB', '512KB'].includes(size)) {
      this.bufferSize = size;
      try {
        localStorage.setItem('radiostream_buffer_size', size);
      } catch {}
    }
  }
}

export const audioEngine = new RadioAudioEngine();
