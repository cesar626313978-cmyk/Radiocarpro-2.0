import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { driveCacheService } from './driveCacheService';
import { googleDriveService } from './googleDriveService';
import { teslaBackgroundService } from './teslaBackgroundService';

/**
 * DriveAudioEngine
 * Dual-deck audio pipeline tailored for Google Drive music playback in Tesla and Mobile.
 * Features:
 * - Dual HTMLAudioElement slots ('A' and 'B') for gapless switching & crossfade
 * - Safe per-slot Blob URL lifecycle (no premature revocation)
 * - 3-band Web Audio Equalizer (Bass, Mid, Treble) & Analyzer
 * - Configurable crossfade (0s, 3s, 5s, 8s, 12s)
 * - Vehicle Multi-Track Forward Buffering Engine (cellular drop-out protection)
 * - Synth fallback for demo cyber tracks so playback never errors on mock IDs
 */
export class DriveAudioEngine {
  private audioElementA: HTMLAudioElement;
  private audioElementB: HTMLAudioElement;
  private activeSlot: 'A' | 'B' = 'A';

  private slotABlobUrl: string | null = null;
  private slotBBlobUrl: string | null = null;

  // Web Audio Context & Nodes for EQ & Volume
  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private lowFilterNode: BiquadFilterNode | null = null;
  private midFilterNode: BiquadFilterNode | null = null;
  private highFilterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private currentTrack: DriveAudioFile | null = null;
  private nextTrack: DriveAudioFile | null = null;
  private playlist: DriveAudioFile[] = [];
  private currentIndex = 0;

  private status: DrivePlaybackStatus = 'idle';
  private volume = 0.8;
  private currentTime = 0;
  private duration = 0;
  private hasPreloadedNext = false;
  private hasAttemptedRecovery = false;

  // Crossfade settings
  private crossfadeSeconds = 0; // 0 (OFF), 3, 5, 8, 12
  private isCrossfading = false;
  private crossfadeIntervalId: any = null;

  private statusListeners: Array<(status: DrivePlaybackStatus) => void> = [];
  private timeListeners: Array<(time: number, duration: number) => void> = [];
  private trackListeners: Array<(track: DriveAudioFile | null) => void> = [];
  private playlistListeners: Array<(playlist: DriveAudioFile[]) => void> = [];

  // Vehicle Anti-Dropout Forward Buffering
  private readonly FORWARD_BUFFER_COUNT = 4;
  private isForwardBuffering = false;

  constructor() {
    this.audioElementA = new Audio();
    this.audioElementB = new Audio();

    // Do NOT set crossOrigin = 'anonymous' for blob: URLs.
    // Blob URLs are same-origin by default; setting crossOrigin triggers CORS failures in Chromium/Safari.
    this.audioElementA.preload = 'auto';
    this.audioElementB.preload = 'auto';

    // Tesla & mobile inline media attributes
    this.audioElementA.setAttribute('playsinline', 'true');
    this.audioElementA.setAttribute('webkit-playsinline', 'true');
    this.audioElementA.setAttribute('x-webkit-airplay', 'allow');
    this.audioElementB.setAttribute('playsinline', 'true');
    this.audioElementB.setAttribute('webkit-playsinline', 'true');
    this.audioElementB.setAttribute('x-webkit-airplay', 'allow');

    this.setupElementListeners(this.audioElementA, 'A');
    this.setupElementListeners(this.audioElementB, 'B');

    // Restore saved crossfade preference
    if (typeof window !== 'undefined') {
      try {
        const savedCf = localStorage.getItem('myradiopro_drive_crossfade');
        if (savedCf) {
          const parsed = parseInt(savedCf, 10);
          if ([0, 3, 5, 8, 12].includes(parsed)) {
            this.crossfadeSeconds = parsed;
          }
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
          this.initAudioContextIfNeeded();
          const activeEl = this.getActiveElement();
          if (activeEl && activeEl.paused) {
            console.log('[DriveAudioEngine] Restaurando reproducción de Drive tras minimizado...');
            activeEl.play().catch(() => {});
          }
        }
      });
    }
  }

  private getActiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioElementA : this.audioElementB;
  }

  private getInactiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioElementB : this.audioElementA;
  }

  private assignBlobUrl(slot: 'A' | 'B', newUrl: string) {
    if (slot === 'A') {
      if (this.slotABlobUrl && this.slotABlobUrl !== newUrl && this.slotABlobUrl !== this.slotBBlobUrl) {
        try {
          URL.revokeObjectURL(this.slotABlobUrl);
        } catch {}
      }
      this.slotABlobUrl = newUrl;
    } else {
      if (this.slotBBlobUrl && this.slotBBlobUrl !== newUrl && this.slotBBlobUrl !== this.slotABlobUrl) {
        try {
          URL.revokeObjectURL(this.slotBBlobUrl);
        } catch {}
      }
      this.slotBBlobUrl = newUrl;
    }
  }

  private initAudioContextIfNeeded() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
          this.masterGainNode = this.audioContext.createGain();
          this.masterGainNode.gain.value = this.volume;

          // 3-band Equalizer filters
          this.lowFilterNode = this.audioContext.createBiquadFilter();
          this.lowFilterNode.type = 'lowshelf';
          this.lowFilterNode.frequency.value = 100;
          this.lowFilterNode.gain.value = 0;

          this.midFilterNode = this.audioContext.createBiquadFilter();
          this.midFilterNode.type = 'peaking';
          this.midFilterNode.frequency.value = 1000;
          this.midFilterNode.gain.value = 0;
          this.midFilterNode.Q.value = 1;

          this.highFilterNode = this.audioContext.createBiquadFilter();
          this.highFilterNode.type = 'highshelf';
          this.highFilterNode.frequency.value = 8000;
          this.highFilterNode.gain.value = 0;

          this.analyserNode = this.audioContext.createAnalyser();
          this.analyserNode.fftSize = 64;

          // Connect chain
          const sourceA = this.audioContext.createMediaElementSource(this.audioElementA);
          const sourceB = this.audioContext.createMediaElementSource(this.audioElementB);

          sourceA.connect(this.lowFilterNode);
          sourceB.connect(this.lowFilterNode);

          this.lowFilterNode.connect(this.midFilterNode);
          this.midFilterNode.connect(this.highFilterNode);
          this.highFilterNode.connect(this.masterGainNode);
          this.masterGainNode.connect(this.analyserNode);
          this.analyserNode.connect(this.audioContext.destination);
        } catch {
          // Web Audio not available or media element source already attached
        }
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  private setupElementListeners(audioEl: HTMLAudioElement, slot: 'A' | 'B') {
    audioEl.onloadedmetadata = () => {
      if (this.activeSlot === slot) {
        if (!isNaN(audioEl.duration) && audioEl.duration > 0) {
          this.duration = audioEl.duration;
          if (this.currentTrack && !this.currentTrack.duration) {
            this.currentTrack.duration = Math.round(audioEl.duration);
          }
          this.timeListeners.forEach(l => l(this.currentTime, this.duration));
        }
      }
    };

    audioEl.ondurationchange = () => {
      if (this.activeSlot === slot) {
        if (!isNaN(audioEl.duration) && audioEl.duration > 0) {
          this.duration = audioEl.duration;
          if (this.currentTrack && !this.currentTrack.duration) {
            this.currentTrack.duration = Math.round(audioEl.duration);
          }
          this.timeListeners.forEach(l => l(this.currentTime, this.duration));
        }
      }
    };

    audioEl.ontimeupdate = () => {
      if (this.activeSlot === slot) {
        this.currentTime = audioEl.currentTime;
        if (!isNaN(audioEl.duration) && audioEl.duration > 0) {
          this.duration = audioEl.duration;
        }
        this.timeListeners.forEach(l => l(this.currentTime, this.duration));

        // Check if crossfade should trigger before track ends
        if (
          this.crossfadeSeconds > 0 &&
          !this.isCrossfading &&
          this.playlist.length > 1 &&
          !isNaN(audioEl.duration) &&
          audioEl.duration > this.crossfadeSeconds + 2
        ) {
          const timeLeft = audioEl.duration - audioEl.currentTime;
          if (timeLeft <= this.crossfadeSeconds && timeLeft > 0.4) {
            this.startCrossfade(timeLeft);
          }
        }

        // Check lazy buffering & pre-priming next track
        this.checkLazyBufferAndPreprime();

        // Update Media Session Position State periodically (~300ms)
        if ('mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function' && !isNaN(audioEl.duration) && audioEl.duration > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audioEl.duration,
              playbackRate: audioEl.playbackRate,
              position: audioEl.currentTime,
            });
          } catch {
            // ignore
          }
        }
      }
    };

    audioEl.onplay = () => {
      if (this.activeSlot === slot) {
        this.setStatus('playing');
      }
    };

    audioEl.onpause = () => {
      if (this.activeSlot === slot && this.status === 'playing' && !this.isCrossfading) {
        this.setStatus('paused');
      }
    };

    audioEl.onended = () => {
      if (this.activeSlot === slot) {
        if (!this.isCrossfading) {
          this.playNext();
        }
      }
    };

    audioEl.onerror = () => {
      const err = audioEl.error;
      // Code 1 is MEDIA_ERR_ABORTED - normal during source resets or track switches.
      if (err && err.code === 1) {
        return;
      }

      // If audioEl has no valid src or was cleared, ignore
      if (!audioEl.src || audioEl.src === window.location.href || audioEl.src.endsWith('/')) {
        return;
      }

      if (this.activeSlot === slot) {
        const codeNames = ['NONE', 'MEDIA_ERR_ABORTED', 'MEDIA_ERR_NETWORK', 'MEDIA_ERR_DECODE', 'MEDIA_ERR_SRC_NOT_SUPPORTED'];
        console.warn('Drive Audio Element warning/error details:', {
          slot,
          code: err?.code,
          codeName: err ? codeNames[err.code] || 'UNKNOWN' : 'NONE',
          message: err?.message,
          src: audioEl.src ? audioEl.src.substring(0, 80) : '',
          readyState: audioEl.readyState,
          networkState: audioEl.networkState,
        });

        // 1-time transparent recovery attempt if track had a transient error
        if (this.currentTrack && !this.hasAttemptedRecovery) {
          this.hasAttemptedRecovery = true;
          console.log('[DriveAudioEngine] Reintentando carga de la pista tras incidencia de red...');
          setTimeout(() => {
            if (this.currentTrack) {
              const token = googleDriveService.getToken();
              this.playTrack(this.currentTrack, token || undefined);
            }
          }, 400);
          return;
        }

        this.setStatus('error');
      }
    };
  }

  private setStatus(newStatus: DrivePlaybackStatus) {
    this.status = newStatus;

    // Sync native MediaSession playbackState for Tesla MPRIS & steering wheel
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

    // Tesla background keepalive anchor: maintains hasAudioOutput flag
    if (newStatus === 'playing') {
      teslaBackgroundService.startKeepAlive();
    } else if (newStatus === 'paused' || newStatus === 'idle' || newStatus === 'error') {
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

  public setPlaylist(list: DriveAudioFile[], startIndex = 0) {
    this.playlist = list;
    this.currentIndex = Math.max(0, Math.min(startIndex, list.length - 1));
    this.playlistListeners.forEach(l => l(this.playlist));
    this.refreshCacheFlagsForPlaylist();
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

  private cancelCrossfade() {
    if (this.crossfadeIntervalId) {
      clearInterval(this.crossfadeIntervalId);
      this.crossfadeIntervalId = null;
    }
    this.isCrossfading = false;
  }

  /**
   * Smooth equal-power crossfade between the active slot and inactive slot.
   */
  private async startCrossfade(durationSeconds: number) {
    if (this.isCrossfading || this.playlist.length <= 1) return;
    this.isCrossfading = true;

    const nextIdx = (this.currentIndex + 1) % this.playlist.length;
    const nextItem = this.playlist[nextIdx];
    if (!nextItem) {
      this.isCrossfading = false;
      return;
    }

    const currentEl = this.getActiveElement();
    const nextEl = this.getInactiveElement();
    const nextSlot = this.activeSlot === 'A' ? 'B' : 'A';

    // Ensure next element is loaded
    if (!this.hasPreloadedNext || this.nextTrack?.id !== nextItem.id) {
      try {
        let blob = await driveCacheService.getBlob(nextItem.id);
        if (!blob) {
          if (nextItem.id.startsWith('track-')) {
            blob = this.generateSynthWaveBlob(nextItem.id);
          } else {
            const token = googleDriveService.getToken();
            if (token) {
              blob = await googleDriveService.fetchAudioBlob(token, nextItem.id, undefined, nextItem.mimeType);
              driveCacheService.saveBlob(nextItem.id, blob).catch(() => {});
            }
          }
        }
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          this.assignBlobUrl(nextSlot, blobUrl);
          nextEl.src = blobUrl;
          nextEl.preload = 'auto';
          nextEl.load();
          this.hasPreloadedNext = true;
          this.nextTrack = nextItem;
        }
      } catch (err) {
        console.warn('[DriveAudioEngine] Error cargando pista para crossfade:', err);
        this.isCrossfading = false;
        return;
      }
    }

    // Start next track at volume 0
    nextEl.volume = 0;
    try {
      await nextEl.play();
    } catch {
      this.isCrossfading = false;
      return;
    }

    const crossfadeDurationMs = Math.max(1000, durationSeconds * 1000);
    const startTime = Date.now();
    const targetVolume = this.volume;

    this.crossfadeIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / crossfadeDurationMs);

      // Equal-power curve for constant acoustic volume
      const fadeOut = Math.cos(progress * 0.5 * Math.PI);
      const fadeIn = Math.sin(progress * 0.5 * Math.PI);

      currentEl.volume = Math.max(0, targetVolume * fadeOut);
      nextEl.volume = Math.min(targetVolume, targetVolume * fadeIn);

      if (progress >= 1) {
        this.cancelCrossfade();
        currentEl.pause();
        currentEl.currentTime = 0;
        currentEl.volume = 0;

        // Finalize transition
        this.activeSlot = nextSlot;
        nextEl.volume = targetVolume;
        this.currentIndex = nextIdx;
        this.currentTrack = nextItem;
        this.hasPreloadedNext = false;
        this.nextTrack = null;
        this.duration = (!isNaN(nextEl.duration) && nextEl.duration > 0) ? nextEl.duration : (nextItem.duration || 0);
        this.trackListeners.forEach(l => l(nextItem));
        this.updateMediaSessionMetadata(nextItem);
        this.setStatus('playing');

        // Replenish buffer for upcoming songs
        this.triggerForwardBuffer();
      }
    }, 40);
  }

  /**
   * Fast background audit of tracks in the playlist against IndexedDB cache.
   */
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
    this.initAudioContextIfNeeded();
    this.currentTrack = track;
    this.hasPreloadedNext = false;
    this.currentTime = 0;
    this.duration = track.duration || 0;
    this.trackListeners.forEach(l => l(track));
    this.timeListeners.forEach(l => l(0, this.duration));
    this.setStatus('buffering');

    const authToken = token || googleDriveService.getToken() || '';

    try {
      // 1. Check IndexedDB cache first (instant 0ms offline playback)
      let blob = await driveCacheService.getBlob(track.id);
      let isCached = true;

      if (!blob) {
        isCached = false;
        if (track.id.startsWith('track-')) {
          // Generate synth audio for cyber demo tracks
          blob = this.generateSynthWaveBlob(track.id);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        } else {
          if (!authToken) {
            throw new Error('Pista no disponible sin conexión');
          }
          // 2. Fetch from Google Drive API with accurate MIME detection
          blob = await googleDriveService.fetchAudioBlob(authToken, track.id, undefined, track.mimeType);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        }
      }

      // Mark cached status in playlist
      track.isCached = isCached;

      // 3. Assign Blob URL with safe per-slot registry
      const blobUrl = URL.createObjectURL(blob);
      this.assignBlobUrl(this.activeSlot, blobUrl);

      const activeEl = this.getActiveElement();
      activeEl.pause();
      activeEl.src = blobUrl;
      activeEl.load();
      activeEl.volume = this.volume;

      await activeEl.play();
      this.setStatus('playing');
      this.hasAttemptedRecovery = false;
      this.updateMediaSessionMetadata(track);

      // Determine next track index
      const nextIdx = (this.currentIndex + 1) % this.playlist.length;
      if (this.playlist.length > 1) {
        this.nextTrack = this.playlist[nextIdx];
      }

      // Proactively buffer the upcoming tracks in the background for car anti-dropout
      this.triggerForwardBuffer();
    } catch (err) {
      console.error('Error playing track from Drive:', err);
      this.setStatus('error');
    }
  }

  /**
   * Vehicle Multi-Track Forward Buffering Engine.
   * Downloads upcoming tracks into IndexedDB on disk, guaranteeing continuous music through tunnels.
   */
  public async triggerForwardBuffer() {
    if (this.isForwardBuffering || this.playlist.length <= 1) return;
    const token = googleDriveService.getToken();

    this.isForwardBuffering = true;
    try {
      const bufferLimit = Math.min(this.FORWARD_BUFFER_COUNT, this.playlist.length - 1);

      for (let offset = 1; offset <= bufferLimit; offset++) {
        const nextIdx = (this.currentIndex + offset) % this.playlist.length;
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
              blob = await googleDriveService.fetchAudioBlob(token, trackToBuffer.id, undefined, trackToBuffer.mimeType);
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

        // For the immediate next track (offset 1), also pre-prime the inactive audio element
        if (offset === 1 && !this.hasPreloadedNext) {
          try {
            let nextBlob = await driveCacheService.getBlob(trackToBuffer.id);
            if (!nextBlob && trackToBuffer.id.startsWith('track-')) {
              nextBlob = this.generateSynthWaveBlob(trackToBuffer.id);
              await driveCacheService.saveBlob(trackToBuffer.id, nextBlob);
            }
            if (nextBlob) {
              const blobUrl = URL.createObjectURL(nextBlob);
              const inactiveSlot = this.activeSlot === 'A' ? 'B' : 'A';
              this.assignBlobUrl(inactiveSlot, blobUrl);
              const inactiveEl = this.getInactiveElement();
              inactiveEl.src = blobUrl;
              inactiveEl.preload = 'auto';
              inactiveEl.load();
              this.hasPreloadedNext = true;
              this.nextTrack = trackToBuffer;
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      this.isForwardBuffering = false;
    }
  }

  private checkLazyBufferAndPreprime() {
    if (!this.isForwardBuffering) {
      this.triggerForwardBuffer();
    }
  }

  public async playNext() {
    this.cancelCrossfade();
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    const nextItem = this.playlist[this.currentIndex];
    const token = googleDriveService.getToken();

    // If inactive element was pre-primed with next track, switch active slot instantly
    if (this.hasPreloadedNext && this.nextTrack?.id === nextItem.id) {
      const oldActive = this.getActiveElement();
      oldActive.pause();
      this.activeSlot = this.activeSlot === 'A' ? 'B' : 'A';
      const newActive = this.getActiveElement();
      newActive.volume = this.volume;
      this.currentTime = 0;
      this.duration = (!isNaN(newActive.duration) && newActive.duration > 0) ? newActive.duration : (nextItem.duration || 0);
      this.timeListeners.forEach(l => l(0, this.duration));
      await newActive.play();
      this.currentTrack = nextItem;
      this.hasPreloadedNext = false;
      this.trackListeners.forEach(l => l(nextItem));
      this.setStatus('playing');
      this.updateMediaSessionMetadata(nextItem);
      this.triggerForwardBuffer();
    } else {
      await this.playTrack(nextItem, token || undefined);
    }
  }

  public async playPrev() {
    this.cancelCrossfade();
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    const prevItem = this.playlist[this.currentIndex];
    const token = googleDriveService.getToken();
    await this.playTrack(prevItem, token || undefined);
  }

  public pause() {
    this.cancelCrossfade();
    const activeEl = this.getActiveElement();
    activeEl.pause();
    this.setStatus('paused');
  }

  public resume() {
    this.initAudioContextIfNeeded();
    const activeEl = this.getActiveElement();
    activeEl.volume = this.volume;
    if (activeEl.src) {
      activeEl.play().then(() => {
        this.setStatus('playing');
      }).catch(err => {
        console.warn('Error resuming drive playback:', err);
      });
    } else if (this.currentTrack) {
      const token = googleDriveService.getToken();
      this.playTrack(this.currentTrack, token || undefined);
    }
  }

  public stop() {
    this.cancelCrossfade();
    this.audioElementA.pause();
    this.audioElementB.pause();
    this.audioElementA.src = '';
    this.audioElementB.src = '';
    if (this.slotABlobUrl) {
      try { URL.revokeObjectURL(this.slotABlobUrl); } catch {}
      this.slotABlobUrl = null;
    }
    if (this.slotBBlobUrl) {
      try { URL.revokeObjectURL(this.slotBBlobUrl); } catch {}
      this.slotBBlobUrl = null;
    }
    this.currentTrack = null;
    this.setStatus('idle');
  }

  public seek(seconds: number) {
    this.cancelCrossfade();
    const activeEl = this.getActiveElement();
    if (!isNaN(activeEl.duration) && activeEl.duration > 0) {
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
    return activeEl && !isNaN(activeEl.duration) && activeEl.duration > 0 ? activeEl.duration : this.duration;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (!this.isCrossfading) {
      this.audioElementA.volume = this.volume;
      this.audioElementB.volume = this.volume;
    }
    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
    }
  }

  public setEqualizer(lowGain: number, midGain: number, highGain: number) {
    if (this.lowFilterNode && this.midFilterNode && this.highFilterNode && this.audioContext) {
      const now = this.audioContext.currentTime;
      this.lowFilterNode.gain.setTargetAtTime(lowGain, now, 0.1);
      this.midFilterNode.gain.setTargetAtTime(midGain, now, 0.1);
      this.highFilterNode.gain.setTargetAtTime(highGain, now, 0.1);
    }
  }

  private updateMediaSessionMetadata(track: DriveAudioFile) {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
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
        navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
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

  public getCurrentTrack(): DriveAudioFile | null {
    return this.currentTrack;
  }

  public getStatus(): DrivePlaybackStatus {
    return this.status;
  }

  public getPlaylist(): DriveAudioFile[] {
    return this.playlist;
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public onPlaylistChange(callback: (playlist: DriveAudioFile[]) => void): () => void {
    this.playlistListeners.push(callback);
    callback(this.playlist);
    return () => {
      this.playlistListeners = this.playlistListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Generates a 14-second punchy Cyber Synthwave demo audio loop
   * so demo tracks in CarMode play without network requests or 404s.
   */
  private generateSynthWaveBlob(trackId: string): Blob {
    const sampleRate = 44100;
    const duration = 14;
    const numSamples = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + numSamples * 4);
    const view = new DataView(buffer);

    // RIFF header
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

      // Bassline
      const bass = Math.sin(2 * Math.PI * root * t) * 0.35 + Math.sin(2 * Math.PI * root * 2 * t) * 0.12;

      // Arpeggio
      const step = Math.floor(t * 4) % 8;
      const arpIntervals = [0, 7, 12, 15, 19, 15, 12, 7];
      const arpFreq = root * 2 * Math.pow(2, arpIntervals[step] / 12);
      const arpEnv = Math.exp(-((t * 4) % 1) * 3);
      const arp = Math.sin(2 * Math.PI * arpFreq * t) * 0.22 * arpEnv;

      // Kick drum pulse (120 bpm = every 0.5s)
      const beatTime = t % 0.5;
      const kickFreq = Math.max(45, 120 * Math.exp(-beatTime * 30));
      const kick = Math.sin(2 * Math.PI * kickFreq * beatTime) * Math.exp(-beatTime * 8) * 0.45;

      // Synth pad
      const pad = (Math.sin(2 * Math.PI * root * 1.5 * t) + Math.sin(2 * Math.PI * root * 2.01 * t)) * 0.08;

      // Hi-hat
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
