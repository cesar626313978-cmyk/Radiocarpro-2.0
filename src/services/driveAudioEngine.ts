import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { driveCacheService } from './driveCacheService';
import { googleDriveService } from './googleDriveService';

/**
 * Advanced Cloud Drive Audio Engine for Google Drive MP3 tracks.
 * Features:
 * - Dual Audio Element Architecture (Audio A / Audio B) for gapless/seamless playback.
 * - Web Audio API BiquadFilter 3-band EQ (Lowshelf 100Hz, Peaking 1kHz, Highshelf 8kHz) + Master Gain.
 * - Strict RAM Ceiling: Max 2 active Object URLs, revoking unused Blob URLs deterministically.
 * - Lazy Buffering: Preloads next track only after current track passes 10s or 25% progress.
 * - IndexedDB Cache integration with offline fallback badge.
 * - Media Session API synchronization and position state reporting.
 */
class DriveAudioEngine {
  private audioElementA: HTMLAudioElement;
  private audioElementB: HTMLAudioElement;
  private activeSlot: 'A' | 'B' = 'A';

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
  private isPreloadingNext = false;
  private hasPreloadedNext = false;

  private activeBlobUrls: string[] = [];
  private statusListeners: Array<(status: DrivePlaybackStatus) => void> = [];
  private timeListeners: Array<(time: number, duration: number) => void> = [];
  private trackListeners: Array<(track: DriveAudioFile | null) => void> = [];

  constructor() {
    this.audioElementA = new Audio();
    this.audioElementB = new Audio();
    this.audioElementA.crossOrigin = 'anonymous';
    this.audioElementB.crossOrigin = 'anonymous';
    this.audioElementA.preload = 'auto';
    this.audioElementB.preload = 'auto';

    this.setupElementListeners(this.audioElementA, 'A');
    this.setupElementListeners(this.audioElementB, 'B');
  }

  private getActiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioElementA : this.audioElementB;
  }

  private getInactiveElement(): HTMLAudioElement {
    return this.activeSlot === 'A' ? this.audioElementB : this.audioElementA;
  }

  private initAudioContextIfNeeded() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
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

        // Connect chain: Element -> Low -> Mid -> High -> MasterGain -> Analyser -> Destination
        try {
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
          // Already connected or cross-origin node exception
        }
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  private setupElementListeners(audioEl: HTMLAudioElement, slot: 'A' | 'B') {
    audioEl.ontimeupdate = () => {
      if (this.activeSlot === slot) {
        this.currentTime = audioEl.currentTime;
        this.duration = audioEl.duration || 0;
        this.timeListeners.forEach(l => l(this.currentTime, this.duration));

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
      if (this.activeSlot === slot && this.status === 'playing') {
        this.setStatus('paused');
      }
    };

    audioEl.onended = () => {
      if (this.activeSlot === slot) {
        this.playNext();
      }
    };

    audioEl.onerror = () => {
      if (this.activeSlot === slot) {
        console.error('Drive Audio Element Error:', audioEl.error);
        this.setStatus('error');
      }
    };
  }

  private setStatus(newStatus: DrivePlaybackStatus) {
    this.status = newStatus;
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
  }

  public async playTrack(track: DriveAudioFile, token: string) {
    this.initAudioContextIfNeeded();
    this.currentTrack = track;
    this.hasPreloadedNext = false;
    this.isPreloadingNext = false;
    this.trackListeners.forEach(l => l(track));
    this.setStatus('buffering');

    try {
      // 1. Check IndexedDB cache first
      let blob = await driveCacheService.getBlob(track.id);
      let isCached = true;

      if (!blob) {
        isCached = false;
        // 2. Fetch from Google Drive API
        blob = await googleDriveService.fetchAudioBlob(token, track.id);
        // Save to IndexedDB cache in background
        driveCacheService.saveBlob(track.id, blob).catch(() => {});
      }

      // Mark cached status in playlist
      track.isCached = isCached;

      // 3. Create Blob URL with RAM ceiling enforcement (Max 2 active Blob URLs)
      const blobUrl = URL.createObjectURL(blob);
      this.registerBlobUrl(blobUrl);

      const activeEl = this.getActiveElement();
      activeEl.pause();
      activeEl.src = blobUrl;
      activeEl.load();
      activeEl.volume = this.volume;

      await activeEl.play();
      this.setStatus('playing');
      this.updateMediaSessionMetadata(track);

      // Determine next track index
      const nextIdx = (this.currentIndex + 1) % this.playlist.length;
      if (this.playlist.length > 1) {
        this.nextTrack = this.playlist[nextIdx];
      }
    } catch (err) {
      console.error('Error playing track from Drive:', err);
      this.setStatus('error');
    }
  }

  private registerBlobUrl(url: string) {
    this.activeBlobUrls.push(url);
    // Strict RAM ceiling: keep at most 2 active Blob URLs
    if (this.activeBlobUrls.length > 2) {
      const oldUrl = this.activeBlobUrls.shift();
      if (oldUrl) {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch {
          // ignore
        }
      }
    }
  }

  private checkLazyBufferAndPreprime() {
    if (!this.currentTrack || !this.nextTrack || this.hasPreloadedNext || this.isPreloadingNext) return;

    const activeEl = this.getActiveElement();
    const currentDuration = activeEl.duration;
    const currentTime = activeEl.currentTime;

    if (!isNaN(currentDuration) && currentDuration > 0) {
      const progressPercent = (currentTime / currentDuration) * 100;
      // Lazy Buffering: Trigger preload when played >= 10 seconds or 25% of song,
      // or Pre-priming: 5 seconds before end of current track.
      const timeRemaining = currentDuration - currentTime;
      if (currentTime >= 10 || progressPercent >= 25 || timeRemaining <= 5) {
        this.preloadNextTrack();
      }
    }
  }

  private async preloadNextTrack() {
    if (!this.nextTrack || this.hasPreloadedNext || this.isPreloadingNext) return;
    this.isPreloadingNext = true;

    try {
      const token = googleDriveService.getToken();
      if (!token) return;

      let blob = await driveCacheService.getBlob(this.nextTrack.id);
      if (!blob) {
        blob = await googleDriveService.fetchAudioBlob(token, this.nextTrack.id);
        driveCacheService.saveBlob(this.nextTrack.id, blob).catch(() => {});
      }

      const blobUrl = URL.createObjectURL(blob);
      this.registerBlobUrl(blobUrl);

      const inactiveEl = this.getInactiveElement();
      inactiveEl.src = blobUrl;
      inactiveEl.preload = 'auto';
      inactiveEl.load(); // Codec pre-priming
      this.hasPreloadedNext = true;
    } catch (err) {
      console.warn('Error pre-priming next track:', err);
    } finally {
      this.isPreloadingNext = false;
    }
  }

  public async playNext() {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
    const nextItem = this.playlist[this.currentIndex];
    const token = googleDriveService.getToken();
    if (token) {
      // If inactive element was pre-primed with next track, switch active slot instantly for gapless transition
      if (this.hasPreloadedNext && this.nextTrack?.id === nextItem.id) {
        const oldActive = this.getActiveElement();
        oldActive.pause();
        this.activeSlot = this.activeSlot === 'A' ? 'B' : 'A';
        const newActive = this.getActiveElement();
        newActive.volume = this.volume;
        await newActive.play();
        this.currentTrack = nextItem;
        this.hasPreloadedNext = false;
        this.trackListeners.forEach(l => l(nextItem));
        this.setStatus('playing');
        this.updateMediaSessionMetadata(nextItem);
      } else {
        await this.playTrack(nextItem, token);
      }
    }
  }

  public async playPrev() {
    if (this.playlist.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    const prevItem = this.playlist[this.currentIndex];
    const token = googleDriveService.getToken();
    if (token) {
      await this.playTrack(prevItem, token);
    }
  }

  public pause() {
    const activeEl = this.getActiveElement();
    activeEl.pause();
    this.setStatus('paused');
  }

  public resume() {
    const activeEl = this.getActiveElement();
    if (activeEl.src) {
      activeEl.play().then(() => this.setStatus('playing')).catch(() => {});
    }
  }

  public stop() {
    this.audioElementA.pause();
    this.audioElementA.src = '';
    this.audioElementB.pause();
    this.audioElementB.src = '';
    this.currentTrack = null;
    this.setStatus('idle');
  }

  public seek(seconds: number) {
    const activeEl = this.getActiveElement();
    if (!isNaN(activeEl.duration) && activeEl.duration > 0) {
      activeEl.currentTime = Math.max(0, Math.min(seconds, activeEl.duration));
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audioElementA.volume = this.volume;
    this.audioElementB.volume = this.volume;
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
}

export const driveAudioEngine = new DriveAudioEngine();
