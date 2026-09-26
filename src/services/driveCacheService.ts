import { DriveAudioFile } from '../types/drive';

/**
 * IndexedDB storage service for Google Drive audio files and metadata.
 * Implements persistent caching (`myradiopro_drive_cache`) with stores `metadata` and `audio_blobs`,
 * and handles QuotaExceededError with LRU (Least Recently Used) eviction and Safeguard 3.
 */

const DB_NAME = 'myradiopro_drive_cache';
const DB_VERSION = 1;
const STORE_METADATA = 'metadata';
const STORE_BLOBS = 'audio_blobs';

export interface CachedBlobRecord {
  fileId: string;
  blob: Blob;
  timestamp: number;
  size: number;
}

export interface CachedLibraryRecord {
  id: string; // 'current_library'
  folderId: string;
  folderName: string;
  files: DriveAudioFile[];
  subfolders: { id: string; name: string }[];
  allRecursiveFiles: DriveAudioFile[];
  folderStack: { id: string; name: string }[];
  totalRecursiveFiles: number;
  folderStatus: string;
  timestamp: number;
}

export class DriveCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryLibrary: CachedLibraryRecord | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_METADATA)) {
            db.createObjectStore(STORE_METADATA, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_BLOBS)) {
            const blobStore = db.createObjectStore(STORE_BLOBS, { keyPath: 'fileId' });
            blobStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });
    }
    return this.dbPromise;
  }

  public async getBlob(fileId: string): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_BLOBS, 'readonly');
        const store = transaction.objectStore(STORE_BLOBS);
        const request = store.get(fileId);
        request.onsuccess = () => {
          const record = request.result as CachedBlobRecord;
          if (record && record.blob) {
            // Update timestamp for LRU tracking in background
            this.touchBlob(fileId).catch(() => {});
            resolve(record.blob);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Error reading from IndexedDB blob cache:', err);
      return null;
    }
  }

  /**
   * Ultra-fast check whether an audio file is already cached in IndexedDB
   * without loading the binary Blob into memory.
   */
  public async isCached(fileId: string): Promise<boolean> {
    try {
      const db = await this.getDB();
      return await new Promise<boolean>((resolve) => {
        const transaction = db.transaction(STORE_BLOBS, 'readonly');
        const store = transaction.objectStore(STORE_BLOBS);
        const request = store.count(fileId);
        request.onsuccess = () => resolve(request.result > 0);
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  private async touchBlob(fileId: string) {
    try {
      const db = await this.getDB();
      const transaction = db.transaction(STORE_BLOBS, 'readwrite');
      const store = transaction.objectStore(STORE_BLOBS);
      const request = store.get(fileId);
      request.onsuccess = () => {
        const record = request.result as CachedBlobRecord;
        if (record) {
          record.timestamp = Date.now();
          store.put(record);
        }
      };
    } catch {
      // ignore
    }
  }

  /**
   * Salvaguarda 3: Verificación proactiva de cuota de almacenamiento del navegador
   */
  public async checkAndEnforceStorageQuota(): Promise<void> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined && estimate.quota !== undefined && estimate.quota > 0) {
          const usageRatio = estimate.usage / estimate.quota;
          if (usageRatio > 0.8) {
            console.warn(`[DriveCacheService] Uso de almacenamiento elevado (${Math.round(usageRatio * 100)}%). Ejecutando purga LRU preventiva...`);
            for (let i = 0; i < 4; i++) {
              const evicted = await this.evictOldestBlob();
              if (!evicted) break;
            }
          }
        }
      } catch (err) {
        console.warn('[DriveCacheService] Error comprobando cuota de almacenamiento:', err);
      }
    }
  }

  public async saveBlob(fileId: string, blob: Blob): Promise<void> {
    await this.checkAndEnforceStorageQuota();

    const record: CachedBlobRecord = {
      fileId,
      blob,
      timestamp: Date.now(),
      size: blob.size,
    };

    let saved = false;
    let attempts = 0;

    while (!saved && attempts < 3) {
      try {
        const db = await this.getDB();
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_BLOBS, 'readwrite');
          const store = transaction.objectStore(STORE_BLOBS);
          const request = store.put(record);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
        saved = true;
      } catch (err: any) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
          console.warn('[DriveCacheService] QuotaExceededError detectado. Desalojando blob más antiguo (LRU)...');
          const evicted = await this.evictOldestBlob();
          if (!evicted) {
            console.error('[DriveCacheService] No se pudieron liberar más blobs en IndexedDB.');
            break;
          }
        } else {
          console.error('[DriveCacheService] Error guardando blob en IndexedDB:', err);
          break;
        }
      }
      attempts++;
    }
  }

  public async evictOldestBlob(): Promise<boolean> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_BLOBS, 'readwrite');
        const store = transaction.objectStore(STORE_BLOBS);
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'next'); // oldest first

        request.onsuccess = event => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const fileIdToDelete = cursor.value.fileId;
            store.delete(fileIdToDelete);
            resolve(true);
          } else {
            resolve(false);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.error('Error during LRU blob eviction:', err);
      return false;
    }
  }

  public async getCachedFileIds(): Promise<string[]> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_BLOBS, 'readonly');
        const store = transaction.objectStore(STORE_BLOBS);
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result as string[]);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Synchronous library cache recovery from memory or localStorage.
   * Enables 0-millisecond instant UI render on mount without loading spinners!
   */
  public getCachedLibrarySync(): CachedLibraryRecord | null {
    if (this.memoryLibrary && this.memoryLibrary.allRecursiveFiles && this.memoryLibrary.allRecursiveFiles.length > 0) {
      return this.memoryLibrary;
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('radiostream_drive_library_cache');
        if (raw) {
          const parsed = JSON.parse(raw) as CachedLibraryRecord;
          if (parsed && Array.isArray(parsed.allRecursiveFiles) && parsed.allRecursiveFiles.length > 0) {
            this.memoryLibrary = parsed;
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  }

  /**
   * Asynchronous library cache retrieval from IndexedDB (fallback).
   */
  public async getCachedLibrary(): Promise<CachedLibraryRecord | null> {
    const sync = this.getCachedLibrarySync();
    if (sync) return sync;

    try {
      const db = await this.getDB();
      const record = await new Promise<CachedLibraryRecord | null>((resolve, reject) => {
        const transaction = db.transaction(STORE_METADATA, 'readonly');
        const store = transaction.objectStore(STORE_METADATA);
        const request = store.get('current_library');
        request.onsuccess = () => resolve((request.result as CachedLibraryRecord) || null);
        request.onerror = () => reject(request.error);
      });
      if (record && Array.isArray(record.allRecursiveFiles) && record.allRecursiveFiles.length > 0) {
        this.memoryLibrary = record;
        return record;
      }
    } catch (err) {
      console.warn('Error reading library from IndexedDB:', err);
    }
    return null;
  }

  /**
   * Saves scanned library metadata both in memory, IndexedDB, and localStorage.
   */
  public async saveCachedLibrary(data: Omit<CachedLibraryRecord, 'id' | 'timestamp'>): Promise<void> {
    const record: CachedLibraryRecord = {
      ...data,
      id: 'current_library',
      timestamp: Date.now(),
    };
    this.memoryLibrary = record;

    // Save to localStorage for instant synchronous recovery
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('radiostream_drive_library_cache', JSON.stringify(record));
      } catch (err) {
        console.warn('Could not save library cache to localStorage:', err);
      }
    }

    // Save to IndexedDB
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_METADATA, 'readwrite');
        const store = transaction.objectStore(STORE_METADATA);
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('Could not save library cache to IndexedDB:', err);
    }
  }

  /**
   * Clears the library cache when the user switches account or disconnects.
   */
  public async clearCachedLibrary(): Promise<void> {
    this.memoryLibrary = null;
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('radiostream_drive_library_cache');
      } catch {}
    }
    try {
      const db = await this.getDB();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_METADATA, 'readwrite');
        const store = transaction.objectStore(STORE_METADATA);
        const request = store.delete('current_library');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {}
  }
}

export const driveCacheService = new DriveCacheService();
