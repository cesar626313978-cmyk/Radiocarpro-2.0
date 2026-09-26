import { DriveAudioFile } from '../types/drive';
import firebaseConfig from '../../firebase-applet-config.json';
import { driveDownloadManager } from './driveDownloadManager';

const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

export class GoogleDriveService {
  private accessToken: string | null = null;
  private tokenExpiryTime = 0;
  private tokenClient: any = null;
  private tokenListeners: ((hasToken: boolean) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedToken = localStorage.getItem('radiostream_drive_token');
        const savedExpiry = localStorage.getItem('radiostream_drive_token_expiry');
        if (savedToken && savedExpiry) {
          const expiryNum = Number(savedExpiry);
          if (Date.now() < expiryNum) {
            this.accessToken = savedToken;
            this.tokenExpiryTime = expiryNum;
          }
        }
      } catch {}
      this.checkAndConsumeHashToken();
    }
  }

  public hasToken(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiryTime;
  }

  public onTokenChange(listener: (hasToken: boolean) => void): () => void {
    this.tokenListeners.push(listener);
    try {
      listener(this.hasToken());
    } catch {}
    return () => {
      this.tokenListeners = this.tokenListeners.filter(l => l !== listener);
    };
  }

  private notifyTokenChange() {
    const current = this.hasToken();
    this.tokenListeners.forEach(listener => {
      try {
        listener(current);
      } catch {}
    });
  }

  public setAccessToken(token: string, expiresInMs = 3600 * 1000) {
    this.accessToken = token;
    this.tokenExpiryTime = Date.now() + expiresInMs - 300 * 1000;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('radiostream_drive_token', token);
        localStorage.setItem('radiostream_drive_token_expiry', String(this.tokenExpiryTime));
      } catch {}
    }
    this.notifyTokenChange();
  }

  public clearAccessToken() {
    this.accessToken = null;
    this.tokenExpiryTime = 0;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('radiostream_drive_token');
        localStorage.removeItem('radiostream_drive_token_expiry');
      } catch {}
    }
    this.notifyTokenChange();
  }

  public getToken(): string | null {
    if (this.hasToken()) {
      return this.accessToken;
    }
    return null;
  }

  /**
   * Fetches Google user profile using the active token
   */
  public async fetchUserInfo(): Promise<{ email?: string; displayName?: string; photoURL?: string } | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        return {
          email: data.email,
          displayName: data.name || data.given_name,
          photoURL: data.picture,
        };
      }
    } catch {}

    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          return {
            email: data.user.emailAddress,
            displayName: data.user.displayName,
            photoURL: data.user.photoLink,
          };
        }
      }
    } catch {}

    return null;
  }

  /**
   * Checks if URL hash contains an OAuth token (from a redirect flow) and saves it
   */
  public checkAndConsumeHashToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        const expiresIn = params.get('expires_in');
        if (token) {
          const expiresInMs = expiresIn ? Number(expiresIn) * 1000 : 3600 * 1000;
          this.setAccessToken(token, expiresInMs);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return token;
        }
      }
    } catch {}
    return null;
  }

  /**
   * Direct Full-Window OAuth Redirect (Tesla Browser compatible - avoids broken popup new tabs)
   */
  public redirectToOAuth(userEmail?: string): void {
    if (typeof window === 'undefined') return;
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || firebaseConfig.oAuthClientId;
    const redirectUri = window.location.origin + window.location.pathname;
    try {
      localStorage.setItem('radiostream_redirect_initiated', 'true');
    } catch {}
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: DRIVE_SCOPES,
      include_granted_scopes: 'true',
      prompt: 'select_account',
    });
    if (userEmail) {
      params.append('login_hint', userEmail);
    }
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  public authenticate(userEmail?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !(window as any).google || !(window as any).google.accounts) {
        reject(new Error('Google Identity Services (GIS) no está disponible en este entorno.'));
        return;
      }

      const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || firebaseConfig.oAuthClientId;
      if (!clientId) {
        reject(new Error('oAuthClientId no encontrado en la configuración.'));
        return;
      }

      try {
        if (!this.tokenClient) {
          this.tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_SCOPES,
            callback: (response: any) => {
              if (response.error) {
                reject(new Error(response.error_description || response.error));
                return;
              }
              if (response.access_token) {
                // Tokens usually expire in 3600s, set safety buffer (e.g., 50 mins)
                const expiresIn = response.expires_in ? Number(response.expires_in) * 1000 : 3600 * 1000;
                this.setAccessToken(response.access_token, expiresIn);
                resolve(this.accessToken!);
              } else {
                reject(new Error('No se recibió token de acceso de Google Drive.'));
              }
            },
          });
        }

        // Request token (triggers Google popup / consent) with hint if provided
        const reqOptions: any = { prompt: '' };
        if (userEmail) {
          reqOptions.hint = userEmail;
        }
        this.tokenClient.requestAccessToken(reqOptions);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper with Exponential Backoff + Jitter for HTTP 429 and 5xx responses
   */
  private async fetchWithBackoff(url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> {
    try {
      const response = await fetch(url, options);
      if (response.status === 401) {
        console.warn('[GoogleDriveService] Access token expired or invalid (HTTP 401). Clearing token.');
        this.clearAccessToken();
        return response;
      }
      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (retries > 0) {
          const jitter = Math.random() * 300;
          const nextDelay = delay * 2 + jitter;
          console.warn(`Google Drive API HTTP ${response.status}. Reintentando en ${Math.round(nextDelay)}ms...`);
          await new Promise(res => setTimeout(res, nextDelay));
          return this.fetchWithBackoff(url, options, retries - 1, nextDelay);
        }
      }
      return response;
    } catch (err) {
      if (retries > 0) {
        const jitter = Math.random() * 300;
        const nextDelay = delay * 2 + jitter;
        await new Promise(res => setTimeout(res, nextDelay));
        return this.fetchWithBackoff(url, options, retries - 1, nextDelay);
      }
      throw err;
    }
  }

  public inferMimeTypeFromName(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'mp3':
        return 'audio/mpeg';
      case 'm4a':
      case 'aac':
        return 'audio/mp4';
      case 'wav':
        return 'audio/wav';
      case 'flac':
        return 'audio/flac';
      case 'ogg':
        return 'audio/ogg';
      case 'opus':
        return 'audio/opus';
      case 'webm':
        return 'audio/webm';
      default:
        return 'audio/mpeg';
    }
  }

  public extractFolderId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return trimmed;
  }

  /**
   * Searches for the music folder in Google Drive (preferred ID, localStorage, default ID '1mUgFaomlz2DDuXNw_1T5fQ64bGympC8E', or 'mimusica' name).
   */
  public async findMusicFolderId(token: string, preferredInput?: string): Promise<string | null> {
    let targetId = preferredInput ? this.extractFolderId(preferredInput) : '';

    // 1. If preferredInput was provided, verify it first
    if (targetId) {
      try {
        const url = `https://www.googleapis.com/drive/v3/files/${targetId}?fields=id,name,mimeType`;
        const res = await this.fetchWithBackoff(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            if (typeof window !== 'undefined') {
              try { localStorage.setItem('radiostream_drive_folder_id', data.id); } catch {}
            }
            return data.id;
          }
        }
      } catch {
        // continue to name search
      }
    }

    // 2. Search user's Drive by common music folder names first ('mimusica', '_MUSIC', 'Music', 'Música')
    const query = encodeURIComponent("(name = 'mimusica' or name = '_MUSIC' or name = 'Music' or name = 'Música') and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    try {
      const res = await this.fetchWithBackoff(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          const foundId = data.files[0].id;
          if (typeof window !== 'undefined') {
            try { localStorage.setItem('radiostream_drive_folder_id', foundId); } catch {}
          }
          return foundId;
        }
      }
    } catch {
      // continue
    }

    // 3. Fallback to localStorage saved ID if name search didn't return anything
    if (!targetId && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('radiostream_drive_folder_id');
        if (saved) {
          const verifyUrl = `https://www.googleapis.com/drive/v3/files/${saved}?fields=id,name,mimeType`;
          const verifyRes = await this.fetchWithBackoff(verifyUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (verifyRes.ok) {
            return saved;
          }
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  /**
   * Lists audio files (.mp3, audio/*) inside the specified folder ID and all its subfolders recursively,
   * treating each subfolder name as the album / playlist name.
   */
  public async listAudioFilesInFolder(token: string, folderId: string): Promise<DriveAudioFile[]> {
    const allFiles: DriveAudioFile[] = [];
    const seenFileIds = new Set<string>();
    const visitedFolderIds = new Set<string>();

    const traverseFolder = async (currentId: string, currentAlbumName: string) => {
      if (visitedFolderIds.has(currentId)) return;
      visitedFolderIds.add(currentId);

      const AUDIO_EXT_REGEX = /\.(mp3|m4a|wav|flac|aac|ogg|wma|opus|webm)$/i;
      let audioPageToken: string | undefined = undefined;

      do {
        const audioQuery = encodeURIComponent(`'${currentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
        const fields = encodeURIComponent('nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink)');
        let audioUrl = `https://www.googleapis.com/drive/v3/files?q=${audioQuery}&fields=${fields}&pageSize=100`;
        if (audioPageToken) {
          audioUrl += `&pageToken=${encodeURIComponent(audioPageToken)}`;
        }

        const audioRes = await this.fetchWithBackoff(audioUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (audioRes.ok) {
          const audioData = await audioRes.json();
          const files = audioData.files || [];
          for (const file of files) {
            if (seenFileIds.has(file.id)) continue;
            const isAudio = (file.mimeType && file.mimeType.startsWith('audio/')) || AUDIO_EXT_REGEX.test(file.name || '');
            if (!isAudio) continue;

            seenFileIds.add(file.id);

            let name = file.name || 'Pista sin título';
            name = name.replace(/\.[^/.]+$/, ''); // remove extension
            let artist = 'Google Drive Cloud';
            let album = currentAlbumName;

            if (name.includes(' - ')) {
              const parts = name.split(' - ');
              artist = parts[0].trim();
              name = parts.slice(1).join(' - ').trim();
            }

            const detectedMime = (file.mimeType && file.mimeType.startsWith('audio/'))
              ? file.mimeType
              : this.inferMimeTypeFromName(file.name || '');

            allFiles.push({
              id: file.id,
              name,
              size: file.size ? Number(file.size) : undefined,
              modifiedTime: file.modifiedTime,
              thumbnailLink: file.thumbnailLink,
              artist,
              album,
              mimeType: detectedMime,
              isCached: false,
            });
          }
          audioPageToken = audioData.nextPageToken;
        } else {
          audioPageToken = undefined;
        }
      } while (audioPageToken);

      // Fetch subfolders in this folder
      let subPageToken: string | undefined = undefined;
      const subFoldersToTraverse: { id: string; name: string }[] = [];

      do {
        const subFolderQuery = encodeURIComponent(`'${currentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        let subFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${subFolderQuery}&fields=nextPageToken,files(id,name)&pageSize=100`;
        if (subPageToken) {
          subFolderUrl += `&pageToken=${encodeURIComponent(subPageToken)}`;
        }

        const subRes = await this.fetchWithBackoff(subFolderUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (subRes.ok) {
          const subData = await subRes.json();
          const subFolders = subData.files || [];
          for (const sub of subFolders) {
            if (!visitedFolderIds.has(sub.id)) {
              subFoldersToTraverse.push({ id: sub.id, name: sub.name });
            }
          }
          subPageToken = subData.nextPageToken;
        } else {
          subPageToken = undefined;
        }
      } while (subPageToken);

      for (const sub of subFoldersToTraverse) {
        await traverseFolder(sub.id, sub.name);
      }
    };

    let rootName = 'Mi Música';
    try {
      const rootRes = await this.fetchWithBackoff(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (rootRes.ok) {
        const rootData = await rootRes.json();
        if (rootData && rootData.name) {
          rootName = rootData.name;
        }
      }
    } catch {}

    await traverseFolder(folderId, rootName);
    return allFiles;
  }

  /**
   * Retrieves subfolders and audio files for a specific folder ID (navigable folders).
   */
  public async getFolderContents(token: string, folderId: string): Promise<import('../types/drive').DriveFolderContent> {
    let folderName = 'Mi Música';
    try {
      const folderRes = await this.fetchWithBackoff(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (folderRes.ok) {
        const folderData = await folderRes.json();
        if (folderData?.name) folderName = folderData.name;
      }
    } catch {}

    const files: import('../types/drive').DriveAudioFile[] = [];
    const seenFileIds = new Set<string>();
    const AUDIO_EXT_REGEX = /\.(mp3|m4a|wav|flac|aac|ogg|wma|opus|webm)$/i;

    let audioPageToken: string | undefined = undefined;
    do {
      const audioQuery = encodeURIComponent(`'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
      const fields = encodeURIComponent('nextPageToken, files(id, name, mimeType, size, modifiedTime, thumbnailLink)');
      let audioUrl = `https://www.googleapis.com/drive/v3/files?q=${audioQuery}&fields=${fields}&pageSize=100`;
      if (audioPageToken) {
        audioUrl += `&pageToken=${encodeURIComponent(audioPageToken)}`;
      }

      const audioRes = await this.fetchWithBackoff(audioUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (audioRes.ok) {
        const audioData = await audioRes.json();
        const rawFiles = audioData.files || [];
        for (const file of rawFiles) {
          if (seenFileIds.has(file.id)) continue;
          const isAudio = (file.mimeType && file.mimeType.startsWith('audio/')) || AUDIO_EXT_REGEX.test(file.name || '');
          if (!isAudio) continue;

          seenFileIds.add(file.id);

          let name = file.name || 'Pista sin título';
          name = name.replace(/\.[^/.]+$/, '');
          let artist = 'Google Drive Cloud';
          let album = folderName;

          if (name.includes(' - ')) {
            const parts = name.split(' - ');
            artist = parts[0].trim();
            name = parts.slice(1).join(' - ').trim();
          }

          const detectedMime = (file.mimeType && file.mimeType.startsWith('audio/'))
            ? file.mimeType
            : this.inferMimeTypeFromName(file.name || '');

          files.push({
            id: file.id,
            name,
            size: file.size ? Number(file.size) : undefined,
            modifiedTime: file.modifiedTime,
            thumbnailLink: file.thumbnailLink,
            artist,
            album,
            mimeType: detectedMime,
            isCached: false,
          });
        }
        audioPageToken = audioData.nextPageToken;
      } else {
        audioPageToken = undefined;
      }
    } while (audioPageToken);

    const subfolders: { id: string; name: string }[] = [];
    const seenSubfolderIds = new Set<string>();

    let subPageToken: string | undefined = undefined;
    do {
      const subFolderQuery = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
      let subFolderUrl = `https://www.googleapis.com/drive/v3/files?q=${subFolderQuery}&fields=nextPageToken,files(id,name)&pageSize=100`;
      if (subPageToken) {
        subFolderUrl += `&pageToken=${encodeURIComponent(subPageToken)}`;
      }

      const subRes = await this.fetchWithBackoff(subFolderUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        const rawSubs = subData.files || [];
        for (const sub of rawSubs) {
          if (!seenSubfolderIds.has(sub.id)) {
            seenSubfolderIds.add(sub.id);
            subfolders.push({ id: sub.id, name: sub.name });
          }
        }
        subPageToken = subData.nextPageToken;
      } else {
        subPageToken = undefined;
      }
    } while (subPageToken);

    return {
      folderId,
      folderName,
      subfolders,
      files,
    };
  }

  /**
   * Fetches binary audio stream from Google Drive for a file ID.
   * Handles virus scan prompts (large files), preserves accurate audio MIME type,
   * and reports download progress.
   */
  public async fetchAudioBlob(
    token: string,
    fileId: string,
    onProgress?: (percent: number) => void,
    expectedMimeType?: string
  ): Promise<Blob> {
    if (!onProgress) {
      try {
        const rawBlob = await driveDownloadManager.fetchDriveMediaBinary(fileId, token);
        let finalMimeType = expectedMimeType;
        if (!finalMimeType || finalMimeType === 'application/octet-stream') {
          if (rawBlob.type && rawBlob.type.startsWith('audio/')) {
            finalMimeType = rawBlob.type;
          } else {
            finalMimeType = 'audio/mpeg';
          }
        }
        if (rawBlob.type && rawBlob.type.startsWith('audio/')) {
          return rawBlob;
        }
        return new Blob([rawBlob], { type: finalMimeType });
      } catch (err) {
        console.warn('[GoogleDriveService] Error con driveDownloadManager, intentando fallback directo:', err);
      }
    }

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&acknowledgeAbuse=true`;
    let res = await this.fetchWithBackoff(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`No se pudo descargar el archivo de audio (HTTP ${res.status})`);
    }

    const headerContentType = res.headers.get('content-type') || '';

    // Handle Google Drive virus warning HTML on files > 100MB
    if (headerContentType.includes('text/html')) {
      const htmlText = await res.text();
      const confirmMatch = htmlText.match(/confirm=([0-9A-Za-z_-]+)/);
      if (confirmMatch && confirmMatch[1]) {
        const retryUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&confirm=${confirmMatch[1]}&acknowledgeAbuse=true`;
        res = await this.fetchWithBackoff(retryUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Fallo tras confirmación de descarga de archivo grande (HTTP ${res.status})`);
        }
      } else {
        throw new Error('Google Drive no devolvió un flujo de audio válido.');
      }
    }

    let finalMimeType = expectedMimeType;
    if (!finalMimeType || finalMimeType === 'application/octet-stream') {
      const respType = res.headers.get('content-type') || '';
      if (respType.startsWith('audio/')) {
        finalMimeType = respType;
      } else {
        finalMimeType = 'audio/mpeg';
      }
    }

    const contentLength = res.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!res.body || total === 0 || !onProgress) {
      const rawBlob = await res.blob();
      if (rawBlob.type && rawBlob.type.startsWith('audio/')) {
        return rawBlob;
      }
      return new Blob([rawBlob], { type: finalMimeType });
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      receivedLength += value.length;
      if (total > 0 && onProgress) {
        const percent = Math.min(100, Math.round((receivedLength / total) * 100));
        onProgress(percent);
      }
    }

    return new Blob(chunks, { type: finalMimeType });
  }
}

export const googleDriveService = new GoogleDriveService();
