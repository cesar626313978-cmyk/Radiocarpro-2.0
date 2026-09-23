export interface DriveAudioFile {
  id: string;
  name: string;
  size?: number;
  modifiedTime?: string;
  thumbnailLink?: string;
  duration?: number;
  artist?: string;
  album?: string;
  isCached?: boolean;
}

export interface DriveFolderContent {
  folderId: string;
  folderName: string;
  subfolders: { id: string; name: string }[];
  files: DriveAudioFile[];
}

export type DrivePlaybackStatus = 'idle' | 'buffering' | 'playing' | 'paused' | 'error';
