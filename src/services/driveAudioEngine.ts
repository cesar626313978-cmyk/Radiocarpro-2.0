import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { driveCacheService } from './driveCacheService';
import { driveDownloadManager } from './driveDownloadManager';
import { googleDriveService } from './googleDriveService';
import { teslaBackgroundService } from './teslaBackgroundService';
import { DEFAULT_CAR_TRACKS } from '../constants/carTracks';

/**
 * DriveAudioEngine
 * Dual-deck audio pipeline tailored for Google Drive music playback in Tesla, Mobile and Desktop.
 * 
 * Architectural Highlights:
 * - Singleton AudioContext with defensive reactivation (resume()) on user gestures.
 * - Formal node disconnection (disconnectNodes) to prevent Web Audio graph leakage.
 * - Salvaguarda 1 (Lazy Buffering / Anti-Skip): No preloading next track until 10s or 25% completed.
 * - Salvaguarda 2 (Strict RAM ceiling): Max 2 Blob URLs managed deterministically by DriveDownloadManager.
 * - Salvaguarda 4 (Codec Pre-Priming): Hardware decoder pre-warmed via preload='auto' and .load() 5s before song end.
 * - Media Session Heartbeat (300ms) with defensive setPositionState().
 * - Equal-power acoustic crossfade between dual decks with dedicated GainNodes.
 */
export class DriveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Filtros del ecualizador paramétrico de 3 bandas
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  // Elementos HTMLAudioElement duales (Pletina A y B)
  private deckA: HTMLAudioElement;
  private deckB: HTMLAudioElement;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;

  private activeSlot: 'A' | 'B' = 'A';
  private preloadedSlot: 'A' | 'B' = 'B';
  private currentTrackDuration = 0;
  private isPreloadTriggered = false;
  private isPrePrimed = false;
  private mediaSessionInterval: number | null = null;

  private currentTrack: DriveAudioFile | null = null;
  private nextTrack: DriveAudioFile | null = null;
  private playlist: DriveAudioFile[] = [...DEFAULT_CAR_TRACKS];
  private currentIndex = 1; // Default to track 2 ("Neon Supercharger")

  private status: DrivePlaybackStatus = 'idle';
  private volume = 0.8;
  private currentTime = 0;
  private duration = 184;
  private hasPreloadedNext = false;
  private hasAttemptedRecovery = false;

  // Crossfade & Gapless Transition Settings
  private crossfadeSeconds = 0; // 0 (seamless micro-fade), 3, 5, 8, 12
  private isCrossfading = false;
  private isTransitioning = false;
  private isTransitionInProgress = false;
  private crossfadeIntervalId: any = null;

  // Shuffle & Repeat Modes
  private isShuffle = false;
  private isRepeat = false;

  private statusListeners: Array<(status: DrivePlaybackStatus) => void> = [];
  private timeListeners: Array<(time: number, duration: number) => void> = [];
  private trackListeners: Array<(track: DriveAudioFile | null) => void> = [];
  private playlistListeners: Array<(playlist: DriveAudioFile[]) => void> = [];

  // Vehicle Anti-Dropout Forward Buffering
  private forwardBufferCount = 4;
  private isForwardBuffering = false;
  private bufferSize = '128KB';
  private plannedNextIndex: number | null = null;

  constructor() {
    this.deckA = new Audio();
    this.deckB = new Audio();

    // Obligatorio para Web Audio API sin silenciado por CORS
    this.deckA.crossOrigin = 'anonymous';
    this.deckB.crossOrigin = 'anonymous';

    this.deckA.preload = 'auto';
    this.deckB.preload = 'auto';

    // Tesla & mobile inline media attributes
    this.deckA.setAttribute('playsinline', 'true');
    this.deckA.setAttribute('webkit-playsinline', 'true');
    this.deckA.setAttribute('x-webkit-airplay', 'allow');
    this.deckB.setAttribute('playsinline', 'true');
    this.deckB.setAttribute('webkit-playsinline', 'true');
    this.deckB.setAttribute('x-webkit-airplay', 'allow');

    this.setupListeners(this.deckA, 'A');
    this.setupListeners(this.deckB, 'B');

    // Default current track
    this.currentTrack = this.playlist[this.currentIndex] || this.playlist[0] || null;
    if (this.currentTrack?.duration) {
      this.duration = this.currentTrack.duration;
      this.currentTrackDuration = this.duration;
    }

    // Restore saved crossfade and buffer size preferences
    if (typeof window !== 'undefined') {
      try {
        const savedCf = localStorage.getItem('myradiopro_drive_crossfade');
        if (savedCf) {
          const parsed = parseInt(savedCf, 10);
          if ([0, 3, 5, 8, 12].includes(parsed)) {
            this.crossfadeSeconds = parsed;
          }
        }
        const savedBuf = localStorage.getItem('radiostream_buffer_size');
        if (savedBuf && ['64KB', '128KB', '256KB', '512KB'].includes(savedBuf)) {
          this.bufferSize = savedBuf;
          if (savedBuf === '64KB') this.forwardBufferCount = 2;
          else if (savedBuf === '128KB') this.forwardBufferCount = 4;
          else if (savedBuf === '256KB') this.forwardBufferCount = 6;
          else if (savedBuf === '512KB') this.forwardBufferCount = 8;
        }
      } catch {
        // ignore
      }

      // Auto-resume background buffer when car re-enters cellular coverage
      window.addEventListener('online', () => {
        console.log('[DriveAudioEngine] Red online detectada. Reanudando búfer de canciones de Drive...');
        this.triggerForwardBuffer();
      });

      // Restore playback when browser is brought to front in Tesla
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.status === 'playing') {
          this.initAudioGraph();
          const activeEl = this.getActiveElement();
          if (activeEl && activeEl.paused) {
            console.log('[DriveAudioEngine] Restaurando reproducción de Drive tras minimizado...');
            activeEl.play().catch(() => {});
          }
        }
      });
    }
  }

  /**
   * Singleton global con reactivación defensiva (resume())
   */
  public initAudioGraph(): void {
    if (this.ctx) {
      this.connectNodes();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;

    try {
      this.ctx = new AudioCtxClass({ latencyHint: 'playback' });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      // Configuración Ecualizador Paramétrico de 3 Bandas
      this.eqLow = this.ctx.createBiquadFilter();
      this.eqLow.type = 'lowshelf';
      this.eqLow.frequency.value = 100;
      this.eqLow.gain.value = 0;

      this.eqMid = this.ctx.createBiquadFilter();
      this.eqMid.type = 'peaking';
      this.eqMid.frequency.value = 1000;
      this.eqMid.Q.value = 1.0;
      this.eqMid.gain.value = 0;

      this.eqHigh = this.ctx.createBiquadFilter();
      this.eqHigh.type = 'highshelf';
      this.eqHigh.frequency.value = 8000;
      this.eqHigh.gain.value = 0;

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 64;

      // Enrutamiento de efectos a destino
      this.connectNodes();

      // Conexión Pletina A
      this.sourceA = this.ctx.createMediaElementSource(this.deckA);
      this.gainA = this.ctx.createGain();
      this.gainA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
      this.sourceA.connect(this.gainA);
      this.gainA.connect(this.eqLow);

      // Conexión Pletina B
      this.sourceB = this.ctx.createMediaElementSource(this.deckB);
      this.gainB = this.ctx.createGain();
      this.gainB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;
      this.sourceB.connect(this.gainB);
      this.gainB.connect(this.eqLow);
    } catch (err) {
      console.warn('[DriveAudioEngine] AudioContext init warning:', err);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public connectNodes(): void {
    if (!this.ctx || !this.masterGain || !this.eqLow || !this.eqMid || !this.eqHigh || !this.analyserNode) return;
    try {
      this.eqLow.disconnect();
      this.eqMid.disconnect();
      this.eqHigh.disconnect();
      this.masterGain.disconnect();
      this.analyserNode.disconnect();

      this.eqLow.connect(this.eqMid);
      this.eqMid.connect(this.eqHigh);
      this.eqHigh.connect(this.masterGain);
      this.masterGain.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);

      if (this.sourceA && this.gainA) {
        this.sourceA.disconnect();
        this.gainA.disconnect();
        this.sourceA.connect(this.gainA);
        this.gainA.connect(this.eqLow);
      }
      if (this.sourceB && this.gainB) {
        this.sourceB.disconnect();
        this.gainB.disconnect();
        this.sourceB.connect(this.gainB);
        this.gainB.connect(this.eqLow);
      }
    } catch (err) {
      console.warn('[DriveAudioEngine] Reconnect warning:', err);
    }
  }

  public initAudioContextIfNeeded() {
    this.initAudioGraph();
  }

  /**
   * Desconexión formal de nodos para evitar acumulación de ramas en Web Audio
   */
  public disconnectNodes(): void {
    try {
      if (this.masterGain) {
        this.masterGain.disconnect();
      }
      if (this.eqHigh) {
        this.eqHigh.disconnect();
      }
      if (this.eqMid) {
        this.eqMid.disconnect();
      }
      if (this.eqLow) {
        this.eqLow.disconnect();
      }
      if (this.gainA) {
        this.gainA.disconnect();
      }
      if (this.gainB) {
        this.gainB.disconnect();
      }
      if (this.analyserNode) {
        this.analyserNode.disconnect();
      }
    } catch (err) {
      console.warn('[DriveAudioEngine] Error formal al desconectar nodos de audio:', err);
    }
  }

  public async setEqualizerGains(lowDb: number, midDb: number, highDb: number): Promise<void> {
    if (!this.eqLow || !this.eqMid || !this.eqHigh || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.eqLow.gain.setTargetAtTime(lowDb, now, 0.05);
    this.eqMid.gain.setTargetAtTime(midDb, now, 0.05);
    this.eqHigh.gain.setTargetAtTime(highDb, now, 0.05);
  }

  public setEqualizer(lowGain: number, midGain: number, highGain: number) {
    this.setEqualizerGains(lowGain, midGain, highGain);
  }

  private getActiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.deckA : this.deckB;
  }

  private getInactiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.deckB : this.deckA;
  }

  private setupListeners(deck: HTMLAudioElement, slot: 'A' | 'B'): void {
    deck.addEventListener('loadedmetadata', () => {
      if (this.activeSlot === slot) {
        if (!isNaN(deck.duration) && isFinite(deck.duration) && deck.duration > 0) {
          this.duration = deck.duration;
          this.currentTrackDuration = deck.duration;
          if (this.currentTrack && !this.currentTrack.duration) {
            this.currentTrack.duration = Math.round(deck.duration);
          }
          this.timeListeners.forEach(l => l(this.currentTime, this.duration));
        }
      }
    });

    deck.addEventListener('durationchange', () => {
      if (this.activeSlot === slot) {
        if (!isNaN(deck.duration) && isFinite(deck.duration) && deck.duration > 0) {
          this.duration = deck.duration;
          this.currentTrackDuration = deck.duration;
          if (this.currentTrack && !this.currentTrack.duration) {
            this.currentTrack.duration = Math.round(deck.duration);
          }
          this.timeListeners.forEach(l => l(this.currentTime, this.duration));
        }
      }
    });

    deck.addEventListener('timeupdate', () => {
      if (this.activeSlot !== slot) return;

      const currentTime = deck.currentTime;
      const duration = deck.duration || this.currentTrackDuration;

      this.currentTime = currentTime;
      if (!isNaN(deck.duration) && isFinite(deck.duration) && deck.duration > 0) {
        this.duration = deck.duration;
        this.currentTrackDuration = deck.duration;
      }
      this.timeListeners.forEach(l => l(this.currentTime, this.duration));

      // Salvaguarda 1: Verificador de Lazy Buffering (Anti-Skip de 10s / 25%)
      if (
        !this.isPreloadTriggered &&
        driveDownloadManager.canPreloadNext(currentTime, duration) &&
        this.playlist.length > 1
      ) {
        this.isPreloadTriggered = true;
        this.prepareNextTrack().catch(() => {});
      }

      // Salvaguarda 4: Pre-priming de hardware decodificador 5s antes del final
      if (duration > 0 && duration - currentTime <= 5 && !this.isPrePrimed) {
        this.executeCodecPrePriming();
      }

      // Proactive transition check before track reaches absolute EOF
      if (
        !this.isTransitionInProgress &&
        !this.isTransitioning &&
        !this.isCrossfading &&
        this.status === 'playing' &&
        this.playlist.length > 0 &&
        !isNaN(deck.duration) &&
        isFinite(deck.duration) &&
        deck.duration > 3
      ) {
        const timeLeft = deck.duration - deck.currentTime;
        const triggerThreshold = this.crossfadeSeconds > 0
          ? Math.min(this.crossfadeSeconds + 0.4, Math.max(1.5, deck.duration - 0.5))
          : 0.35;

        if (timeLeft <= triggerThreshold && timeLeft > 0.05) {
          this.isTransitionInProgress = true;
          this.playNext(false);
        }
      }
    });

    deck.addEventListener('play', () => {
      if (this.activeSlot === slot && !this.isTransitionInProgress && !this.isTransitioning) {
        this.setStatus('playing');
      }
    });

    deck.addEventListener('pause', () => {
      if (this.isTransitionInProgress || this.isTransitioning || this.isCrossfading) {
        return;
      }
      if (this.activeSlot !== slot) {
        return;
      }
      if (
        deck.ended ||
        (isFinite(deck.duration) && deck.duration > 0 && deck.currentTime >= deck.duration - 0.5)
      ) {
        return;
      }
      if (this.status === 'playing') {
        this.setStatus('paused');
      }
    });

    deck.addEventListener('ended', () => {
      if (this.activeSlot === slot) {
        this.handleTrackEnded();
      }
    });

    deck.addEventListener('error', () => {
      const err = deck.error;
      if (err && err.code === 1) return; // MEDIA_ERR_ABORTED
      if (!deck.src || deck.src === window.location.href || deck.src.endsWith('/')) return;

      if (this.activeSlot === slot) {
        console.warn('[DriveAudioEngine] Audio element error in active slot:', err?.message);
        if (this.currentTrack && !this.hasAttemptedRecovery) {
          this.hasAttemptedRecovery = true;
          setTimeout(() => {
            if (this.currentTrack) {
              const token = googleDriveService.getToken();
              this.playTrack(this.currentTrack, token || undefined);
            }
          }, 300);
          return;
        }

        if (this.playlist.length > 1 && !this.isTransitioning) {
          console.log('[DriveAudioEngine] Pasando a la siguiente pista tras error de reproducción...');
          setTimeout(() => this.playNext(false), 500);
        } else {
          this.setStatus('error');
        }
      }
    });
  }

  /**
   * Salvaguarda 4: Calentamiento del decodificador hardware sin iniciar reproducción
   */
  private executeCodecPrePriming(): void {
    const idleDeck = this.activeSlot === 'A' ? this.deckB : this.deckA;
    if (idleDeck.src && idleDeck.src.startsWith('blob:')) {
      this.isPrePrimed = true;
      idleDeck.preload = 'auto';
      idleDeck.load();
      console.log('[DriveAudioEngine] Pre-priming de códec ejecutado en pletina inactiva');
    }
  }

  private handleTrackEnded(): void {
    if (!this.isTransitionInProgress && !this.isTransitioning && !this.isCrossfading) {
      this.isTransitionInProgress = true;
      this.playNext(false);
    }
  }

  /**
   * Sincronización Media Session: Heartbeat a 300 ms con setPositionState() defensivo
   */
  private startMediaSessionHeartbeat(): void {
    if (this.mediaSessionInterval !== null) return;
    this.mediaSessionInterval = window.setInterval(() => {
      const activeDeck = this.getActiveElement();
      if (
        typeof navigator !== 'undefined' &&
        'mediaSession' in navigator &&
        typeof navigator.mediaSession.setPositionState === 'function' &&
        activeDeck &&
        !isNaN(activeDeck.duration) &&
        isFinite(activeDeck.duration) &&
        activeDeck.duration > 0
      ) {
        try {
          navigator.mediaSession.setPositionState({
            duration: activeDeck.duration,
            playbackRate: activeDeck.playbackRate || 1,
            position: Math.min(activeDeck.currentTime, activeDeck.duration),
          });
        } catch {
          // ignore
        }
      }
    }, 300);
  }

  private stopMediaSessionHeartbeat(): void {
    if (this.mediaSessionInterval !== null) {
      clearInterval(this.mediaSessionInterval);
      this.mediaSessionInterval = null;
    }
  }

  private setStatus(newStatus: DrivePlaybackStatus) {
    this.status = newStatus;

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      if (newStatus === 'playing') {
        navigator.mediaSession.playbackState = 'playing';
      } else if (newStatus === 'buffering') {
        navigator.mediaSession.playbackState = 'playing';
      } else if (newStatus === 'paused') {
        navigator.mediaSession.playbackState = 'paused';
      } else if (newStatus === 'idle' || newStatus === 'error') {
        navigator.mediaSession.playbackState = 'none';
      }
    }

    if (newStatus === 'playing') {
      this.startMediaSessionHeartbeat();
      teslaBackgroundService.startKeepAlive();
    } else if (newStatus === 'paused' || newStatus === 'idle' || newStatus === 'error') {
      this.stopMediaSessionHeartbeat();
      teslaBackgroundService.stopKeepAlive();
    }

    this.statusListeners.forEach(l => l(newStatus));
  }

  public onStatusChange(callback: (status: DrivePlaybackStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter(cb => cb !== callback);
    };
  }

  public onTimeUpdate(callback: (time: number, duration: number) => void): () => void {
    this.timeListeners.push(callback);
    return () => {
      this.timeListeners = this.timeListeners.filter(cb => cb !== callback);
    };
  }

  public onTrackChange(callback: (track: DriveAudioFile | null) => void): () => void {
    this.trackListeners.push(callback);
    callback(this.currentTrack);
    return () => {
      this.trackListeners = this.trackListeners.filter(cb => cb !== callback);
    };
  }

  public onPlaylistChange(callback: (playlist: DriveAudioFile[]) => void): () => void {
    this.playlistListeners.push(callback);
    callback(this.playlist);
    return () => {
      this.playlistListeners = this.playlistListeners.filter(cb => cb !== callback);
    };
  }

  public setPlaylist(list: DriveAudioFile[], startIndex = 0) {
    if (!list || list.length === 0) return;
    this.playlist = list;
    this.currentIndex = Math.max(0, Math.min(startIndex, list.length - 1));
    this.currentTrack = this.playlist[this.currentIndex] || null;
    this.planNextTrack();
    this.playlistListeners.forEach(l => l(this.playlist));
    this.refreshCacheFlagsForPlaylist();
  }

  public getPlaylist(): DriveAudioFile[] {
    return this.playlist;
  }

  public getCurrentTrack(): DriveAudioFile | null {
    return this.currentTrack;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getStatus(): DrivePlaybackStatus {
    return this.status;
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
      if (size === '64KB') this.forwardBufferCount = 2;
      else if (size === '128KB') this.forwardBufferCount = 4;
      else if (size === '256KB') this.forwardBufferCount = 6;
      else if (size === '512KB') this.forwardBufferCount = 8;

      this.triggerForwardBuffer();
    }
  }

  public setCrossfadeSeconds(seconds: number) {
    this.crossfadeSeconds = Math.max(0, Math.min(12, seconds));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('myradiopro_drive_crossfade', String(this.crossfadeSeconds));
      } catch {}
    }
  }

  public getCrossfadeSeconds(): number {
    return this.crossfadeSeconds;
  }

  public computeNextIndex(): number {
    if (this.playlist.length <= 1) return 0;
    if (this.isRepeat) {
      return this.currentIndex;
    }
    if (this.isShuffle) {
      let next = Math.floor(Math.random() * this.playlist.length);
      if (next === this.currentIndex && this.playlist.length > 1) {
        next = (next + 1) % this.playlist.length;
      }
      return next;
    }
    return (this.currentIndex + 1) % this.playlist.length;
  }

  public planNextTrack() {
    this.plannedNextIndex = this.computeNextIndex();
    this.hasPreloadedNext = false;
  }

  public setShuffle(enabled: boolean) {
    if (this.isShuffle !== enabled) {
      this.isShuffle = enabled;
      this.planNextTrack();
      this.triggerForwardBuffer();
    }
  }

  public getShuffle(): boolean {
    return this.isShuffle;
  }

  public setRepeat(enabled: boolean) {
    if (this.isRepeat !== enabled) {
      this.isRepeat = enabled;
      this.planNextTrack();
    }
  }

  public getRepeat(): boolean {
    return this.isRepeat;
  }

  private cancelCrossfade() {
    if (this.crossfadeIntervalId) {
      clearInterval(this.crossfadeIntervalId);
      this.crossfadeIntervalId = null;
    }
    this.isCrossfading = false;
    this.isTransitioning = false;
    this.isTransitionInProgress = false;

    const activeEl = this.getActiveElement();
    if (activeEl) {
      activeEl.volume = this.volume;
    }
    const inactiveEl = this.getInactiveElement();
    if (inactiveEl) {
      inactiveEl.pause();
      inactiveEl.volume = 0;
      inactiveEl.currentTime = 0;
    }

    if (this.gainA && this.gainB) {
      this.gainA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
      this.gainB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;
    }
  }

  private getNextIndex(): number {
    if (this.plannedNextIndex !== null && this.plannedNextIndex >= 0 && this.plannedNextIndex < this.playlist.length) {
      return this.plannedNextIndex;
    }
    return this.computeNextIndex();
  }

  private getPrevIndex(): number {
    if (this.playlist.length <= 1) return 0;
    if (this.isRepeat) {
      return this.currentIndex;
    }
    return (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
  }

  /**
   * Prepara y precarga la siguiente pista en la pletina inactiva.
   * Utiliza DriveDownloadManager para el techo de RAM estricto (Salvaguarda 2).
   */
  public async prepareNextTrack(): Promise<void> {
    if (this.playlist.length <= 1) return;
    const nextIdx = (this.plannedNextIndex !== null && this.plannedNextIndex >= 0 && this.plannedNextIndex < this.playlist.length)
      ? this.plannedNextIndex
      : this.computeNextIndex();
    this.plannedNextIndex = nextIdx;

    const trackToBuffer = this.playlist[nextIdx];
    if (!trackToBuffer) return;

    const inactiveEl = this.getInactiveElement();

    if (this.hasPreloadedNext && this.nextTrack?.id === trackToBuffer.id && inactiveEl.src && inactiveEl.readyState >= 2) {
      return;
    }

    try {
      let blob = await driveCacheService.getBlob(trackToBuffer.id);
      if (!blob) {
        if (trackToBuffer.id.startsWith('track-')) {
          blob = this.generateSynthWaveBlob(trackToBuffer.id);
          await driveCacheService.saveBlob(trackToBuffer.id, blob);
        } else {
          const token = googleDriveService.getToken();
          if (token) {
            blob = await driveDownloadManager.fetchDriveMediaBinary(trackToBuffer.id, token);
            await driveCacheService.saveBlob(trackToBuffer.id, blob);
          }
        }
      }

      if (blob) {
        trackToBuffer.isCached = true;
        // Salvaguarda 2: Techo estricto de RAM (máximo 2 Blob URLs simultáneos)
        const preloadedUrl = driveDownloadManager.registerPreloadedTrack(trackToBuffer.id, blob);
        inactiveEl.src = preloadedUrl;
        inactiveEl.preload = 'none'; // Calentamiento a 5s antes de concluir (Salvaguarda 4)

        this.hasPreloadedNext = true;
        this.nextTrack = trackToBuffer;
      }
    } catch (err) {
      console.warn('[DriveAudioEngine] Error preparando siguiente pista:', err);
    }
  }

  /**
   * Controlador central de transición sin fisuras (Gapless / Crossfade)
   */
  public async transitionTo(targetIdx: number, userInitiated = false): Promise<void> {
    if (this.playlist.length === 0) return;
    if (targetIdx < 0 || targetIdx >= this.playlist.length) return;

    const targetTrack = this.playlist[targetIdx];
    if (!targetTrack) return;

    if (this.isCrossfading || this.isTransitioning) {
      this.cancelCrossfade();
    }

    this.isTransitionInProgress = true;
    this.isTransitioning = true;
    this.initAudioGraph();

    const currentEl = this.getActiveElement();
    const nextEl = this.getInactiveElement();
    const currentSlot = this.activeSlot;
    const nextSlot = currentSlot === 'A' ? 'B' : 'A';

    const currentGain = currentSlot === 'A' ? this.gainA : this.gainB;
    const nextGain = nextSlot === 'A' ? this.gainA : this.gainB;

    let transitionDurationMs = 350;
    if (this.crossfadeSeconds > 0) {
      const sec = userInitiated
        ? Math.min(this.crossfadeSeconds, 2.0)
        : this.crossfadeSeconds;
      transitionDurationMs = Math.max(500, sec * 1000);
    }

    if (!userInitiated && currentEl && isFinite(currentEl.duration) && currentEl.duration > 0) {
      const remainingMs = Math.max(400, (currentEl.duration - currentEl.currentTime - 0.25) * 1000);
      transitionDurationMs = Math.min(transitionDurationMs, remainingMs);
    }

    // Paso 1: Asegurar que la pista objetivo esté cargada en la pletina inactiva
    let isTargetReady = (this.hasPreloadedNext && this.nextTrack?.id === targetTrack.id && nextEl.src && nextEl.readyState >= 2);

    if (!isTargetReady) {
      try {
        let blob = await driveCacheService.getBlob(targetTrack.id);
        if (!blob) {
          if (targetTrack.id.startsWith('track-')) {
            blob = this.generateSynthWaveBlob(targetTrack.id);
            driveCacheService.saveBlob(targetTrack.id, blob).catch(() => {});
          } else {
            const token = googleDriveService.getToken();
            if (token) {
              blob = await driveDownloadManager.fetchDriveMediaBinary(targetTrack.id, token);
              driveCacheService.saveBlob(targetTrack.id, blob).catch(() => {});
            }
          }
        }

        if (blob) {
          const blobUrl = driveDownloadManager.registerActivePlayback(targetTrack.id, blob);
          nextEl.src = blobUrl;
          nextEl.preload = 'auto';
          nextEl.load();

          await new Promise<void>(resolve => {
            if (nextEl.readyState >= 2) {
              resolve();
              return;
            }
            const onReady = () => {
              nextEl.removeEventListener('canplay', onReady);
              nextEl.removeEventListener('loadeddata', onReady);
              resolve();
            };
            nextEl.addEventListener('canplay', onReady, { once: true });
            nextEl.addEventListener('loadeddata', onReady, { once: true });
            setTimeout(resolve, 350);
          });
        }
      } catch (loadErr) {
        console.warn('[DriveAudioEngine] Error preparando pista para transición:', loadErr);
        this.isTransitioning = false;
        this.isTransitionInProgress = false;
        const token = googleDriveService.getToken();
        await this.playTrack(targetTrack, token || undefined);
        return;
      }
    }

    // Paso 2: Iniciar pletina objetivo con ganancia 0 mientras la actual continúa reproduciéndose
    nextEl.currentTime = 0;
    if (this.ctx && nextGain) {
      nextGain.gain.value = 0;
      nextEl.volume = this.volume;
    } else {
      nextEl.volume = 0;
    }

    try {
      await nextEl.play();
    } catch (playErr) {
      console.warn('[DriveAudioEngine] Error al iniciar slot inactivo, fallback a slot activo:', playErr);
      try {
        currentEl.src = nextEl.src;
        currentEl.currentTime = 0;
        currentEl.volume = this.volume;
        if (currentGain) currentGain.gain.value = 1.0;
        await currentEl.play();
      } catch (err2) {
        console.error('[DriveAudioEngine] Playback fallback failed:', err2);
      }
      this.currentIndex = targetIdx;
      this.currentTrack = targetTrack;
      this.currentTime = 0;
      this.duration = targetTrack.duration || 184;
      this.currentTrackDuration = this.duration;
      this.trackListeners.forEach(l => l(targetTrack));
      this.timeListeners.forEach(l => l(0, this.duration));
      this.setStatus('playing');
      this.isTransitioning = false;
      this.isTransitionInProgress = false;
      this.triggerForwardBuffer();
      return;
    }

    // Paso 3: Transición activa
    this.isCrossfading = true;
    this.activeSlot = nextSlot;
    this.preloadedSlot = currentSlot;
    this.currentIndex = targetIdx;
    this.currentTrack = targetTrack;
    this.currentTime = 0;
    this.duration = (!isNaN(nextEl.duration) && isFinite(nextEl.duration) && nextEl.duration > 0)
      ? nextEl.duration
      : (targetTrack.duration || 184);
    this.currentTrackDuration = this.duration;

    this.hasPreloadedNext = false;
    this.nextTrack = null;
    this.isPreloadTriggered = false;
    this.isPrePrimed = false;

    this.trackListeners.forEach(l => l(targetTrack));
    this.timeListeners.forEach(l => l(0, this.duration));
    this.updateMediaSessionMetadata(targetTrack);
    this.setStatus('playing');

    // Paso 4: Curva acústica de igual potencia (Equal-power crossfade)
    const startTime = Date.now();
    const targetVolume = this.volume;

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.crossfadeIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / transitionDurationMs);

      const fadeOut = Math.cos(progress * 0.5 * Math.PI);
      const fadeIn = Math.sin(progress * 0.5 * Math.PI);

      if (this.ctx && currentGain && nextGain) {
        currentGain.gain.value = fadeOut;
        nextGain.gain.value = fadeIn;
      } else {
        currentEl.volume = Math.max(0, targetVolume * fadeOut);
        nextEl.volume = Math.min(targetVolume, targetVolume * fadeIn);
      }

      if (progress >= 1) {
        if (this.crossfadeIntervalId) {
          clearInterval(this.crossfadeIntervalId);
          this.crossfadeIntervalId = null;
        }
        this.isCrossfading = false;
        this.isTransitioning = false;
        this.isTransitionInProgress = false;

        currentEl.pause();
        currentEl.currentTime = 0;
        currentEl.volume = 0;
        if (currentGain) currentGain.gain.value = 0;

        nextEl.volume = targetVolume;
        if (nextGain) nextGain.gain.value = 1.0;

        this.planNextTrack();
        this.triggerForwardBuffer();
      }
    }, 20);
  }

  public async playNext(userInitiated = true) {
    if (this.playlist.length === 0) return;
    this.isTransitionInProgress = true;
    const nextIdx = this.getNextIndex();
    await this.transitionTo(nextIdx, userInitiated);
  }

  public async playPrev(userInitiated = true) {
    if (this.playlist.length === 0) return;
    this.isTransitionInProgress = true;
    const prevIdx = this.getPrevIndex();
    await this.transitionTo(prevIdx, userInitiated);
  }

  public async refreshCacheFlagsForPlaylist() {
    let changed = false;
    for (const item of this.playlist) {
      const cached = await driveCacheService.isCached(item.id);
      if (item.isCached !== cached) {
        item.isCached = cached;
        changed = true;
      }
    }
    if (changed) {
      this.playlistListeners.forEach(l => l([...this.playlist]));
    }
  }

  public async playTrack(track: DriveAudioFile, token?: string) {
    this.cancelCrossfade();
    this.initAudioGraph();
    this.primeAudioDecks();

    const foundIdx = this.playlist.findIndex(t => t.id === track.id);
    if (foundIdx !== -1) {
      this.currentIndex = foundIdx;
    } else {
      this.playlist = [track, ...this.playlist];
      this.currentIndex = 0;
      this.playlistListeners.forEach(l => l([...this.playlist]));
    }

    this.planNextTrack();
    this.currentTrack = track;
    this.hasPreloadedNext = false;
    this.isPreloadTriggered = false;
    this.isPrePrimed = false;
    this.currentTime = 0;
    this.duration = track.duration || 184;
    this.currentTrackDuration = this.duration;
    this.trackListeners.forEach(l => l(track));
    this.timeListeners.forEach(l => l(0, this.duration));
    this.setStatus('buffering');

    const authToken = token || googleDriveService.getToken() || '';

    try {
      // 1. Comprobar caché de IndexedDB primero
      let blob = await driveCacheService.getBlob(track.id);
      let isCached = true;

      if (!blob) {
        isCached = false;
        if (track.id.startsWith('track-')) {
          blob = this.generateSynthWaveBlob(track.id);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        } else {
          if (!authToken) {
            throw new Error('Pista no disponible sin conexión');
          }
          blob = await driveDownloadManager.fetchDriveMediaBinary(track.id, authToken);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        }
      }

      track.isCached = isCached;

      // Salvaguarda 2: Techo de RAM Estricto - Máx 2 Blob URLs (promueve o purga previo)
      const blobUrl = driveDownloadManager.registerActivePlayback(track.id, blob);

      const activeEl = this.getActiveElement();
      const inactiveEl = this.getInactiveElement();

      inactiveEl.pause();
      inactiveEl.volume = 0;

      activeEl.pause();
      activeEl.src = blobUrl;
      activeEl.load();
      activeEl.volume = this.volume;

      if (this.gainA && this.gainB) {
        this.gainA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
        this.gainB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;
      }

      await activeEl.play();
      this.setStatus('playing');
      this.hasAttemptedRecovery = false;
      this.updateMediaSessionMetadata(track);

      this.triggerForwardBuffer();
    } catch (err) {
      console.error('[DriveAudioEngine] Error reproduciendo pista:', err);
      if (!track.id.startsWith('track-')) {
        console.log('[DriveAudioEngine] Fallback a audio sintético de respaldo...');
        const synthBlob = this.generateSynthWaveBlob(track.id);
        const synthUrl = driveDownloadManager.registerActivePlayback(track.id, synthBlob);
        const activeEl = this.getActiveElement();
        activeEl.src = synthUrl;
        activeEl.volume = this.volume;
        activeEl.play().then(() => {
          this.setStatus('playing');
        }).catch(() => {
          this.setStatus('error');
        });
      } else {
        this.setStatus('error');
      }
    }
  }

  /**
   * Búfer progresivo para conducción en vehículo
   */
  public async triggerForwardBuffer() {
    if (this.isForwardBuffering || this.playlist.length <= 1) return;
    const token = googleDriveService.getToken();

    this.isForwardBuffering = true;
    try {
      const bufferLimit = Math.min(this.forwardBufferCount, this.playlist.length - 1);
      const immediateNextIdx = (this.plannedNextIndex !== null && this.plannedNextIndex >= 0 && this.plannedNextIndex < this.playlist.length)
        ? this.plannedNextIndex
        : this.computeNextIndex();
      this.plannedNextIndex = immediateNextIdx;

      for (let offset = 1; offset <= bufferLimit; offset++) {
        const nextIdx = offset === 1 ? immediateNextIdx : (this.currentIndex + offset) % this.playlist.length;
        const trackToBuffer = this.playlist[nextIdx];
        if (!trackToBuffer) continue;

        const alreadyCached = await driveCacheService.isCached(trackToBuffer.id);
        if (!alreadyCached) {
          try {
            let blob: Blob;
            if (trackToBuffer.id.startsWith('track-')) {
              blob = this.generateSynthWaveBlob(trackToBuffer.id);
            } else {
              if (!token) break;
              blob = await driveDownloadManager.fetchDriveMediaBinary(trackToBuffer.id, token);
            }
            await driveCacheService.saveBlob(trackToBuffer.id, blob);
            trackToBuffer.isCached = true;
            this.playlistListeners.forEach(l => l([...this.playlist]));
          } catch (fetchErr) {
            console.warn(`[DriveAudioEngine] Buffer notice for track ${trackToBuffer.name}:`, fetchErr);
            break;
          }
        } else if (!trackToBuffer.isCached) {
          trackToBuffer.isCached = true;
          this.playlistListeners.forEach(l => l([...this.playlist]));
        }

        // Si es la pista inmediata, pre-preparar si la salvaguarda 1 lo permite
        if (offset === 1 && !this.hasPreloadedNext && driveDownloadManager.canPreloadNext(this.currentTime, this.duration)) {
          this.prepareNextTrack().catch(() => {});
        }
      }
    } finally {
      this.isForwardBuffering = false;
    }
  }

  public pause() {
    this.cancelCrossfade();
    const activeEl = this.getActiveElement();
    activeEl.pause();
    this.setStatus('paused');
  }

  public resume() {
    this.initAudioGraph();
    this.primeAudioDecks();

    const activeEl = this.getActiveElement();
    activeEl.volume = this.volume;

    if (activeEl.src && activeEl.src !== window.location.href) {
      activeEl.play().then(() => {
        this.setStatus('playing');
      }).catch(err => {
        console.warn('[DriveAudioEngine] Error resuming drive playback:', err);
      });
    } else if (this.currentTrack) {
      const token = googleDriveService.getToken();
      this.playTrack(this.currentTrack, token || undefined);
    } else if (this.playlist.length > 0) {
      const token = googleDriveService.getToken();
      this.playTrack(this.playlist[this.currentIndex || 0], token || undefined);
    }
  }

  public stop() {
    this.cancelCrossfade();
    this.stopMediaSessionHeartbeat();
    this.deckA.pause();
    this.deckB.pause();
    this.deckA.src = '';
    this.deckB.src = '';
    driveDownloadManager.purgeAllBlobs();
    this.currentTrack = null;
    this.setStatus('idle');
  }

  /**
   * Conmutación Limpia de Fuentes:
   * Detiene reproducción, purga todos los Blob URLs de memoria RAM,
   * y desconecta formalmente las pletinas y el grafo Web Audio para liberar hardware al cambiar a Radio.
   */
  public stopAndDisconnect(): void {
    this.stop();
    this.disconnectNodes();
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
    console.log('[DriveAudioEngine] stopAndDisconnect: Pletinas y Web Audio liberados limpiamente.');
  }

  public seek(seconds: number) {
    this.cancelCrossfade();
    const activeEl = this.getActiveElement();
    if (!isNaN(activeEl.duration) && isFinite(activeEl.duration) && activeEl.duration > 0) {
      const target = Math.max(0, Math.min(seconds, activeEl.duration));
      activeEl.currentTime = target;
      activeEl.volume = this.volume;
      this.currentTime = target;
      this.timeListeners.forEach(l => l(this.currentTime, this.duration));
    }
  }

  public getCurrentTime(): number {
    const activeEl = this.getActiveElement();
    return activeEl && !isNaN(activeEl.currentTime) ? activeEl.currentTime : this.currentTime;
  }

  public getDuration(): number {
    const activeEl = this.getActiveElement();
    return activeEl && !isNaN(activeEl.duration) && isFinite(activeEl.duration) && activeEl.duration > 0
      ? activeEl.duration
      : this.duration;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.isCrossfading) {
      this.deckA.volume = this.volume;
      this.deckB.volume = this.volume;
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  public primeAudioDecks() {
    this.initAudioGraph();
    const unlock = (el: HTMLAudioElement) => {
      if (el.paused && !el.src) {
        const dummyAudio = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
        el.src = dummyAudio;
        el.volume = 0;
        el.play().then(() => {
          el.pause();
          el.src = '';
        }).catch(() => {});
      }
    };
    unlock(this.deckA);
    unlock(this.deckB);
  }

  private updateMediaSessionMetadata(track: DriveAudioFile) {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name.replace(/\.(mp3|wav|m4a|flac|aac|ogg)$/i, ''),
        artist: track.artist || 'Google Drive',
        album: track.album || 'Mi Música',
        artwork: [
          { src: track.thumbnailLink || '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });

      try {
        navigator.mediaSession.setActionHandler('play', () => this.resume());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev(true));
        navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext(true));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            this.seek(details.seekTime);
          }
        });
      } catch {
        // ignore
      }
    }
  }

  /**
   * Genera pista synthwave sintetizada de demostración
   */
  private generateSynthWaveBlob(trackId: string): Blob {
    const sampleRate = 44100;
    const duration = 32;
    const numSamples = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + numSamples * 4);
    const view = new DataView(buffer);

    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 4, true);
    this.writeAscii(view, 8, 'WAVE');
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 2, true); // Stereo
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, numSamples * 4, true);

    const baseFreqs = [110, 130.81, 146.83, 164.81, 196, 220];
    const trackNum = parseInt(trackId.replace(/\D/g, '') || '1', 10);
    const root = baseFreqs[(trackNum - 1) % baseFreqs.length];

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;

      const bass = Math.sin(2 * Math.PI * root * t) * 0.35 + Math.sin(2 * Math.PI * root * 2 * t) * 0.12;

      const step = Math.floor(t * 4) % 8;
      const arpIntervals = [0, 7, 12, 15, 19, 15, 12, 7];
      const arpFreq = root * 2 * Math.pow(2, arpIntervals[step] / 12);
      const arpEnv = Math.exp(-((t * 4) % 1) * 3);
      const arp = Math.sin(2 * Math.PI * arpFreq * t) * 0.22 * arpEnv;

      const beatTime = t % 0.5;
      const kickFreq = Math.max(45, 120 * Math.exp(-beatTime * 30));
      const kick = Math.sin(2 * Math.PI * kickFreq * beatTime) * Math.exp(-beatTime * 8) * 0.45;

      const pad = (Math.sin(2 * Math.PI * root * 1.5 * t) + Math.sin(2 * Math.PI * root * 2.01 * t)) * 0.08;

      const hatTime = t % 0.25;
      const hat = (Math.random() * 2 - 1) * Math.exp(-hatTime * 40) * 0.06;

      let left = bass + arp * 0.8 + kick + pad + hat;
      let right = bass + arp * 1.2 + kick + pad + hat * 0.8;

      left = Math.max(-1, Math.min(1, left));
      right = Math.max(-1, Math.min(1, right));

      view.setInt16(offset, left < 0 ? left * 0x8000 : left * 0x7FFF, true);
      offset += 2;
      view.setInt16(offset, right < 0 ? right * 0x8000 : right * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  private writeAscii(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
}

export const driveAudioEngine = new DriveAudioEngine();
