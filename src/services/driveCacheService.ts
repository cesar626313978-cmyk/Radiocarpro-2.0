/**
 * IndexedDB storage service for Google Drive audio files and metadata.
 * Implements persistent caching (`myradiopro_drive_cache`) with stores `metadata` and `audio_blobs`,
 * and handles QuotaExceededError with LRU (Least Recently Used) eviction.
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

export class DriveCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

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

  public async saveBlob(fileId: string, blob: Blob): Promise<void> {
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
          console.warn('IndexedDB QuotaExceededError encountered. Evicting oldest cached blob (LRU)...');
          const evicted = await this.evictOldestBlob();
          if (!evicted) {
            console.error('Could not evict any more blobs to free up storage quota.');
            break;
          }
        } else {
          console.error('Error saving blob to IndexedDB:', err);
          break;
        }
      }
      attempts++;
    }
  }

  private async evictOldestBlob(): Promise<boolean> {
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
}

export const driveCacheService = new DriveCacheService();
