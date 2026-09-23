export interface RadioStation {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  genre: string;
  tags: string[];
  bitrate: number;
  format: 'MP3' | 'AAC' | 'OGG' | 'FLAC';
  streamUrl: string;
  ip: string;
  logoUrl?: string;
  color?: string;
  currentTrack?: string;
  currentArtist?: string;
  isLive?: boolean;
  frequency?: string;
  description?: string;
  accentColor?: string;
}

export type PlaybackStatus = 'idle' | 'buffering' | 'playing' | 'error';

export interface Alarm {
  id: string;
  time: string; // e.g. "07:30"
  days: string[]; // ["Lun", "Mar", "Mié", "Jue", "Vie"]
  stationId: string;
  stationName: string;
  active: boolean;
  label?: string;
  volume: number; // 0 to 100
}

export interface SleepTimerState {
  durationMinutes: number;
  remainingSeconds: number;
  active: boolean;
  fadeOutEnabled: boolean;
}

export interface TelemetryStats {
  daysActive: number;
  totalMinutesListened: number;
  connectionsCount: number;
  historyMatrix: number[][]; // 7 days x 24 weeks
  currentBitrate: number;
  currentLatency: number;
}

export type TabType = 'descubrir' | 'favoritas' | 'coche' | 'drive';
