import { PlaybackStatus } from '../types/radio';

/**
 * High-performance Audio Engine for live internet radio streams.
 * Includes precise connection timeouts (6.5s), connection status events,
 * and Web Audio API real-time frequency analysis.
 * Artificial fallback synthesizers / gong sounds have been completely removed.
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

  constructor() {
    // Lazy initialisation on user action
  }

  private setStatus(newStatus: PlaybackStatus, errorMsg?: string) {
    this.status = newStatus;
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
    // Send current status immediately
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

  public playStream(
    url: string,
    onPlaying?: () => void,
    onError?: (msg?: string) => void,
    onBuffering?: () => void
  ) {
    this.stop();
    this.initAudioContext();
    this.setStatus('buffering');
    if (onBuffering) onBuffering();

    const audio = new Audio();
    this.audio = audio;
    audio.crossOrigin = 'anonymous';
    audio.src = url;
    audio.volume = this.volume;
    audio.preload = 'auto';

    // Hook Web Audio Analyser if supported
    try {
      if (this.audioContext && this.analyser && !this.audioSourceNode) {
        this.audioSourceNode = this.audioContext.createMediaElementSource(audio);
        this.audioSourceNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
      }
    } catch {
      // Audio node already connected or cross-origin restriction
    }

    let hasStarted = false;

    const clearConnectionTimeout = () => {
      if (this.connectionTimeoutTimer !== null) {
        window.clearTimeout(this.connectionTimeoutTimer);
        this.connectionTimeoutTimer = null;
      }
    };

    // 6.5s strict timeout: if stream does not connect within 6.5s, report error immediately
    this.connectionTimeoutTimer = window.setTimeout(() => {
      if (!hasStarted && this.audio === audio) {
        console.warn('Radio stream connection timed out (6.5s):', url);
        this.stop();
        this.setStatus('error', 'Tiempo de conexión agotado (Servidor no responde)');
        if (onError) onError('Tiempo de conexión agotado (Servidor no responde)');
      }
    }, 6500);

    audio.onwaiting = () => {
      if (this.audio === audio && !hasStarted) {
        this.setStatus('buffering');
        if (onBuffering) onBuffering();
      }
    };

    audio.onplaying = () => {
      if (this.audio === audio) {
        hasStarted = true;
        clearConnectionTimeout();
        this.setStatus('playing');
        if (onPlaying) onPlaying();
      }
    };

    audio.onerror = () => {
      if (this.audio === audio) {
        clearConnectionTimeout();
        this.stop();
        const msg = 'No se pudo conectar con el servidor de la emisora';
        this.setStatus('error', msg);
        if (onError) onError(msg);
      }
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          hasStarted = true;
          clearConnectionTimeout();
          this.setStatus('playing');
          if (onPlaying) onPlaying();
        })
        .catch(err => {
          if (err.name === 'AbortError') return; // User stopped intentionally
          clearConnectionTimeout();
          this.stop();
          const msg = 'Emisora temporalmente inaccesible o bloqueada';
          this.setStatus('error', msg);
          if (onError) onError(msg);
        });
    }
  }

  public stop() {
    if (this.connectionTimeoutTimer !== null) {
      window.clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    this.setStatus('idle');
  }

  public pause() {
    if (this.connectionTimeoutTimer !== null) {
      window.clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
    }
    this.setStatus('idle');
  }

  public resume(url?: string) {
    if (this.audio && this.audio.src) {
      this.setStatus('buffering');
      this.audio
        .play()
        .then(() => {
          this.setStatus('playing');
        })
        .catch(() => {
          if (url) {
            this.playStream(url);
          } else {
            this.setStatus('error', 'Error al reanudar');
          }
        });
    } else if (url) {
      this.playStream(url);
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

  public updateMediaMetadata(station: { name: string; genre?: string; logoUrl?: string; country?: string }) {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.genre ? `${station.genre} • En Directo` : 'En Directo',
        album: station.country || 'Myradio PWA',
        artwork: [
          { src: station.logoUrl || '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });

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
      } catch {
        // Some browser engines might not support all actions
      }
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
}

export const audioEngine = new RadioAudioEngine();
