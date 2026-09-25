import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { driveCacheService } from './driveCacheService';
import { googleDriveService } from './googleDriveService';
import { teslaBackgroundService } from './teslaBackgroundService';
import { DEFAULT_CAR_TRACKS } from '../constants/carTracks';

/**
 * DriveAudioEngine
 * Dual-deck audio pipeline tailored for Google Drive music playback in Tesla, Mobile and Desktop.
 * Features:
 * - Dual HTMLAudioElement slots ('A' and 'B') for seamless gapless switching & crossfade
 * - Dedicated Web Audio GainNodes for Deck A & B providing click-free hardware-accelerated crossfades
 * - Safe per-slot Blob URL lifecycle (no premature revocation)
 * - 3-band Web Audio Equalizer (Bass, Mid, Treble) & Spectrum Analyzer
 * - Configurable crossfade (0s = seamless gapless micro-transition, 3s, 5s, 8s, 12s)
 * - Anti-dropout proactive forward buffering into IndexedDB
 * - Autoplay unblock protection for mobile browsers and car screens
 * - Robust end-of-track transition guards preventing unexpected stops
 * - Shuffle (MIX) and Repeat (LOOP) state support
 */
export class DriveAudioEngine {
  private audioElementA: HTMLAudioElement;
  private audioElementB: HTMLAudioElement;
  private activeSlot: 'A' | 'B' = 'A';

  private slotABlobUrl: string | null = null;
  private slotBBlobUrl: string | null = null;

  // Web Audio Context & Nodes for EQ, Crossfade & Volume
  private audioContext: AudioContext | null = null;
  private gainNodeA: GainNode | null = null;
  private gainNodeB: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private lowFilterNode: BiquadFilterNode | null = null;
  private midFilterNode: BiquadFilterNode | null = null;
  private highFilterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;

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
  private crossfadeIntervalId: any = null;

  // Shuffle & Repeat Modes
  private isShuffle = false;
  private isRepeat = false;

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

    // Default current track
    this.currentTrack = this.playlist[this.currentIndex] || this.playlist[0] || null;
    if (this.currentTrack?.duration) {
      this.duration = this.currentTrack.duration;
    }

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

  public initAudioContextIfNeeded() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();

          // Dedicated Deck Gains
          this.gainNodeA = this.audioContext.createGain();
          this.gainNodeB = this.audioContext.createGain();
          this.gainNodeA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
          this.gainNodeB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;

          // Master Gain Node
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

          // Connect media elements to dedicated deck gains
          const sourceA = this.audioContext.createMediaElementSource(this.audioElementA);
          const sourceB = this.audioContext.createMediaElementSource(this.audioElementB);

          sourceA.connect(this.gainNodeA);
          sourceB.connect(this.gainNodeB);

          // Connect deck gains into equalizer & master chain
          this.gainNodeA.connect(this.lowFilterNode);
          this.gainNodeB.connect(this.lowFilterNode);

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

  /**
   * Primes both audio elements during user interaction to avoid mobile/Tesla autoplay restrictions
   */
  public primeAudioDecks() {
    this.initAudioContextIfNeeded();
    // Silently unlock both elements
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
    unlock(this.audioElementA);
    unlock(this.audioElementB);
  }

  private setupElementListeners(audioEl: HTMLAudioElement, slot: 'A' | 'B') {
    audioEl.onloadedmetadata = () => {
      if (this.activeSlot === slot) {
        if (!isNaN(audioEl.duration) && isFinite(audioEl.duration) && audioEl.duration > 0) {
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
        if (!isNaN(audioEl.duration) && isFinite(audioEl.duration) && audioEl.duration > 0) {
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
        if (!isNaN(audioEl.duration) && isFinite(audioEl.duration) && audioEl.duration > 0) {
          this.duration = audioEl.duration;
        }
        this.timeListeners.forEach(l => l(this.currentTime, this.duration));

        // Proactive transition check before track reaches absolute EOF:
        // Guarantees zero silence, zero jump, and prevents browser EOF stop bugs.
        if (
          !this.isTransitioning &&
          !this.isCrossfading &&
          this.status === 'playing' &&
          this.playlist.length > 0 &&
          !isNaN(audioEl.duration) &&
          isFinite(audioEl.duration) &&
          audioEl.duration > 3
        ) {
          const timeLeft = audioEl.duration - audioEl.currentTime;
          // For crossfade: trigger at crossfadeSeconds before end.
          // For crossfade = 0: trigger seamless gapless micro-transition at 0.4s before end.
          const triggerThreshold = this.crossfadeSeconds > 0
            ? Math.min(this.crossfadeSeconds, Math.max(1, audioEl.duration - 1))
            : 0.4;

          if (timeLeft <= triggerThreshold && timeLeft > 0.05) {
            this.playNext(false); // automatic track advancement
          }
        }

        // Lazy forward buffer
        this.checkLazyBufferAndPreprime();

        // Update Media Session Position State periodically (~300ms)
        if (
          'mediaSession' in navigator &&
          typeof navigator.mediaSession.setPositionState === 'function' &&
          !isNaN(audioEl.duration) &&
          isFinite(audioEl.duration) &&
          audioEl.duration > 0
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audioEl.duration,
              playbackRate: audioEl.playbackRate || 1,
              position: Math.min(audioEl.currentTime, audioEl.duration),
            });
          } catch {
            // ignore
          }
        }
      }
    };

    audioEl.onplay = () => {
      if (this.activeSlot === slot && !this.isTransitioning) {
        this.setStatus('playing');
      }
    };

    audioEl.onpause = () => {
      // CRITICAL: Do NOT mark as paused if the track paused due to reaching the end
      // or during an active transition to the next track!
      if (this.isTransitioning || this.isCrossfading) {
        return;
      }
      if (
        audioEl.ended ||
        (isFinite(audioEl.duration) && audioEl.duration > 0 && audioEl.currentTime >= audioEl.duration - 0.5)
      ) {
        return;
      }
      if (this.activeSlot === slot && this.status === 'playing') {
        this.setStatus('paused');
      }
    };

    audioEl.onended = () => {
      // Backup safety: if ontimeupdate didn't already advance, advance now
      if (this.activeSlot === slot && !this.isTransitioning && !this.isCrossfading) {
        this.playNext(false);
      }
    };

    audioEl.onerror = () => {
      const err = audioEl.error;
      // Code 1 is MEDIA_ERR_ABORTED - expected during source resets or track switches.
      if (err && err.code === 1) {
        return;
      }

      // If audioEl has no valid src or was cleared, ignore
      if (!audioEl.src || audioEl.src === window.location.href || audioEl.src.endsWith('/')) {
        return;
      }

      if (this.activeSlot === slot) {
        console.warn('[DriveAudioEngine] Audio element error in active slot:', err?.message);

        // Transparent single recovery attempt if track had a transient error
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

        // Auto advance to next song instead of getting permanently stuck
        if (this.playlist.length > 1 && !this.isTransitioning) {
          console.log('[DriveAudioEngine] Pasando a la siguiente pista tras error de reproducción...');
          setTimeout(() => this.playNext(false), 500);
        } else {
          this.setStatus('error');
        }
      }
    };
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
    if (!list || list.length === 0) return;
    this.playlist = list;
    this.currentIndex = Math.max(0, Math.min(startIndex, list.length - 1));
    this.currentTrack = this.playlist[this.currentIndex] || null;
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

  public setShuffle(enabled: boolean) {
    this.isShuffle = enabled;
  }

  public getShuffle(): boolean {
    return this.isShuffle;
  }

  public setRepeat(enabled: boolean) {
    this.isRepeat = enabled;
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

    if (this.gainNodeA && this.gainNodeB) {
      this.gainNodeA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
      this.gainNodeB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;
    }
  }

  private getNextIndex(): number {
    if (this.playlist.length <= 1) return 0;
    if (this.isRepeat) {
      return this.currentIndex;
    }
    if (this.isShuffle) {
      let next = Math.floor(Math.random() * this.playlist.length);
      if (next === this.currentIndex) {
        next = (next + 1) % this.playlist.length;
      }
      return next;
    }
    return (this.currentIndex + 1) % this.playlist.length;
  }

  private getPrevIndex(): number {
    if (this.playlist.length <= 1) return 0;
    if (this.isRepeat) {
      return this.currentIndex;
    }
    return (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
  }

  /**
   * Central Seamless Transition Controller.
   * Performs an equal-power crossfade or a 350ms seamless gapless micro-fade.
   * The current deck CONTINUES PLAYING until the new deck has actually started!
   * No dead silence, no pops, zero visual or acoustic jumping.
   */
  public async transitionTo(targetIdx: number, userInitiated = false): Promise<void> {
    if (this.playlist.length === 0) return;
    if (targetIdx < 0 || targetIdx >= this.playlist.length) return;

    const targetTrack = this.playlist[targetIdx];
    if (!targetTrack) return;

    if (this.isCrossfading || this.isTransitioning) {
      this.cancelCrossfade();
    }

    this.isTransitioning = true;
    this.initAudioContextIfNeeded();

    const currentEl = this.getActiveElement();
    const nextEl = this.getInactiveElement();
    const currentSlot = this.activeSlot;
    const nextSlot = currentSlot === 'A' ? 'B' : 'A';

    const currentGain = currentSlot === 'A' ? this.gainNodeA : this.gainNodeB;
    const nextGain = nextSlot === 'A' ? this.gainNodeA : this.gainNodeB;

    // Determine transition duration:
    // If crossfade is ON (> 0):
    //   - For manual button skips (userInitiated): quick smooth 2.5s-3.5s crossfade
    //   - For automatic track endings: full configured crossfadeSeconds (e.g. 5s, 8s, 12s)
    // If crossfade is OFF (0):
    //   - Seamless gapless micro-transition of 350ms ("transición nula / imperceptible")
    let transitionDurationMs = 350;
    if (this.crossfadeSeconds > 0) {
      const sec = userInitiated
        ? Math.min(this.crossfadeSeconds, 3.0)
        : this.crossfadeSeconds;
      transitionDurationMs = Math.max(600, sec * 1000);
    }

    // Step 1: Ensure the target audio track is loaded on the inactive deck
    let isTargetReady = (this.hasPreloadedNext && this.nextTrack?.id === targetTrack.id && nextEl.src);

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
              blob = await googleDriveService.fetchAudioBlob(token, targetTrack.id, undefined, targetTrack.mimeType);
              driveCacheService.saveBlob(targetTrack.id, blob).catch(() => {});
            }
          }
        }

        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          this.assignBlobUrl(nextSlot, blobUrl);
          nextEl.src = blobUrl;
          nextEl.preload = 'auto';
          nextEl.load();

          // Wait a tick for metadata / audio decode
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
            setTimeout(resolve, 250); // safety timeout
          });
        }
      } catch (loadErr) {
        console.warn('[DriveAudioEngine] Error preparando pista para transición:', loadErr);
        this.isTransitioning = false;
        // Direct fallback
        const token = googleDriveService.getToken();
        await this.playTrack(targetTrack, token || undefined);
        return;
      }
    }

    // Step 2: Start target deck at volume 0 (Current deck is still playing!)
    nextEl.currentTime = 0;
    nextEl.volume = 0;
    if (nextGain) nextGain.gain.value = 0;

    try {
      await nextEl.play();
    } catch (playErr) {
      console.warn('[DriveAudioEngine] Error al iniciar slot inactivo, fallback a slot activo:', playErr);
      // In mobile or restricted autoplay environments, reuse existing element
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
      this.trackListeners.forEach(l => l(targetTrack));
      this.timeListeners.forEach(l => l(0, this.duration));
      this.setStatus('playing');
      this.isTransitioning = false;
      this.triggerForwardBuffer();
      return;
    }

    // Step 3: Transition is now underway
    this.isCrossfading = true;
    this.activeSlot = nextSlot;
    this.currentIndex = targetIdx;
    this.currentTrack = targetTrack;
    this.currentTime = 0;
    this.duration = (!isNaN(nextEl.duration) && isFinite(nextEl.duration) && nextEl.duration > 0)
      ? nextEl.duration
      : (targetTrack.duration || 184);

    this.hasPreloadedNext = false;
    this.nextTrack = null;

    // Notify listeners so UI updates cleanly with new track information
    this.trackListeners.forEach(l => l(targetTrack));
    this.timeListeners.forEach(l => l(0, this.duration));
    this.updateMediaSessionMetadata(targetTrack);
    this.setStatus('playing');

    // Step 4: Perform equal-power acoustic crossfade
    const startTime = Date.now();
    const targetVolume = this.volume;

    this.crossfadeIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / transitionDurationMs);

      // Equal-power curve: cos^2 + sin^2 = 1 (constant loudness throughout)
      const fadeOut = Math.cos(progress * 0.5 * Math.PI);
      const fadeIn = Math.sin(progress * 0.5 * Math.PI);

      currentEl.volume = Math.max(0, targetVolume * fadeOut);
      nextEl.volume = Math.min(targetVolume, targetVolume * fadeIn);

      if (currentGain) currentGain.gain.value = fadeOut;
      if (nextGain) nextGain.gain.value = fadeIn;

      if (progress >= 1) {
        if (this.crossfadeIntervalId) {
          clearInterval(this.crossfadeIntervalId);
          this.crossfadeIntervalId = null;
        }
        this.isCrossfading = false;
        this.isTransitioning = false;

        currentEl.pause();
        currentEl.currentTime = 0;
        currentEl.volume = 0;
        if (currentGain) currentGain.gain.value = 0;

        nextEl.volume = targetVolume;
        if (nextGain) nextGain.gain.value = 1.0;

        // Proactively buffer upcoming songs for car anti-dropout
        this.triggerForwardBuffer();
      }
    }, 25);
  }

  public async playNext(userInitiated = true) {
    if (this.playlist.length === 0) return;
    const nextIdx = this.getNextIndex();
    await this.transitionTo(nextIdx, userInitiated);
  }

  public async playPrev(userInitiated = true) {
    if (this.playlist.length === 0) return;
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
    this.initAudioContextIfNeeded();
    this.primeAudioDecks();

    // Sync playlist index
    const foundIdx = this.playlist.findIndex(t => t.id === track.id);
    if (foundIdx !== -1) {
      this.currentIndex = foundIdx;
    } else {
      this.playlist = [track, ...this.playlist];
      this.currentIndex = 0;
      this.playlistListeners.forEach(l => l([...this.playlist]));
    }

    this.currentTrack = track;
    this.hasPreloadedNext = false;
    this.currentTime = 0;
    this.duration = track.duration || 184;
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
          blob = this.generateSynthWaveBlob(track.id);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        } else {
          if (!authToken) {
            throw new Error('Pista no disponible sin conexión');
          }
          blob = await googleDriveService.fetchAudioBlob(authToken, track.id, undefined, track.mimeType);
          driveCacheService.saveBlob(track.id, blob).catch(() => {});
        }
      }

      track.isCached = isCached;

      const blobUrl = URL.createObjectURL(blob);
      this.assignBlobUrl(this.activeSlot, blobUrl);

      const activeEl = this.getActiveElement();
      const inactiveEl = this.getInactiveElement();

      inactiveEl.pause();
      inactiveEl.volume = 0;

      activeEl.pause();
      activeEl.src = blobUrl;
      activeEl.load();
      activeEl.volume = this.volume;

      if (this.gainNodeA && this.gainNodeB) {
        this.gainNodeA.gain.value = this.activeSlot === 'A' ? 1.0 : 0.0;
        this.gainNodeB.gain.value = this.activeSlot === 'B' ? 1.0 : 0.0;
      }

      await activeEl.play();
      this.setStatus('playing');
      this.hasAttemptedRecovery = false;
      this.updateMediaSessionMetadata(track);

      // Pre-prime upcoming tracks
      this.triggerForwardBuffer();
    } catch (err) {
      console.error('[DriveAudioEngine] Error reproduciendo pista:', err);
      // Auto-fallback: try synth if real track failed
      if (!track.id.startsWith('track-')) {
        console.log('[DriveAudioEngine] Fallback a audio sintético de respaldo...');
        const synthBlob = this.generateSynthWaveBlob(track.id);
        const synthUrl = URL.createObjectURL(synthBlob);
        this.assignBlobUrl(this.activeSlot, synthUrl);
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
   * Proactively buffers upcoming tracks into IndexedDB and primes the other audio deck.
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

  public pause() {
    this.cancelCrossfade();
    const activeEl = this.getActiveElement();
    activeEl.pause();
    this.setStatus('paused');
  }

  public resume() {
    this.initAudioContextIfNeeded();
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
   * Generates a 32-second punchy Cyber Synthwave demo audio loop
   * with bassline, arpeggios, kick, and hi-hats.
   */
  private generateSynthWaveBlob(trackId: string): Blob {
    const sampleRate = 44100;
    const duration = 32;
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

      // Arpeggio (16th notes at 120 BPM)
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

      // Hi-hat (every 0.25s)
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
