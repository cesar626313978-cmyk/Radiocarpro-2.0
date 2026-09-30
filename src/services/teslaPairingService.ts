import { doc, setDoc, getDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface TeslaPairingData {
  code: string;
  status: 'pending' | 'paired' | 'expired';
  token?: string;
  uid?: string;
  userEmail?: string;
  userDisplayName?: string;
  userPhoto?: string;
  favorites?: string[];
  favoriteStationObjects?: any[];
  deletedFavorites?: string[];
  createdAt: string;
  pairedAt?: string;
  updatedAt?: string;
}

export class TeslaPairingService {
  /**
   * Generates a unique 6-character human-readable pairing code, e.g. "TSL-482"
   */
  public generatePairingCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'TSL-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Creates a new pairing session in Firestore and listens for mobile phone completion
   */
  public async createSession(
    code: string,
    onPaired: (data: TeslaPairingData) => void,
    onError: (err: any) => void
  ): Promise<() => void> {
    const docRef = doc(db, 'tesla_pairings', code);
    const initialData: TeslaPairingData = {
      code,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    await setDoc(docRef, initialData);

    // Subscribe to real-time updates from mobile phone
    const unsubscribe = onSnapshot(
      docRef,
      snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as TeslaPairingData;
        if (data.status === 'paired' && data.token) {
          onPaired(data);
          // Clean up after 1 minute
          setTimeout(() => {
            deleteDoc(docRef).catch(() => {});
          }, 60000);
        }
      },
      err => {
        console.error('Tesla Pairing snapshot error:', err);
        onError(err);
      }
    );

    return () => {
      unsubscribe();
    };
  }

  /**
   * Called by the user's phone to complete pairing
   */
  public async completeSession(
    code: string,
    token: string,
    userInfo: {
      uid?: string;
      email?: string;
      displayName?: string;
      photoURL?: string;
      favorites?: string[];
      favoriteStationObjects?: any[];
      deletedFavorites?: string[];
    }
  ): Promise<void> {
    const docRef = doc(db, 'tesla_pairings', code);
    await updateDoc(docRef, {
      status: 'paired',
      token,
      uid: userInfo.uid || '',
      userEmail: userInfo.email || '',
      userDisplayName: userInfo.displayName || '',
      userPhoto: userInfo.photoURL || '',
      favorites: userInfo.favorites || [],
      favoriteStationObjects: userInfo.favoriteStationObjects || [],
      deletedFavorites: userInfo.deletedFavorites || [],
      pairedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Sync favorites & preferences for a paired Tesla session
   */
  public async savePairedPreferences(
    syncKey: string,
    data: {
      favorites?: string[];
      favoriteStationObjects?: any[];
      deletedFavorites?: string[];
      settings?: any;
      stationPlaytimes?: any;
      driveToken?: string;
      driveTokenExpiresAt?: number;
    }
  ): Promise<void> {
    if (!syncKey) return;
    const cleanKey = ('sync_' + syncKey.replace(/[^a-zA-Z0-9_-]/g, '_')).slice(0, 120);
    const docRef = doc(db, 'tesla_pairings', cleanKey);

    const payload: Record<string, any> = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    // If favorites is explicitly provided (even if empty []), ensure it's saved without reviving deleted stations
    if (data.favorites !== undefined) {
      payload.favorites = data.favorites;
      payload.favoriteStationObjects = data.favoriteStationObjects || [];
    }
    if (data.deletedFavorites !== undefined) {
      payload.deletedFavorites = data.deletedFavorites;
    }

    await setDoc(docRef, payload, { merge: true });
  }

  /**
   * Retrieve current paired preferences from Firestore directly
   */
  public async getPairedPreferences(syncKey: string): Promise<{
    favorites?: string[];
    favoriteStationObjects?: any[];
    deletedFavorites?: string[];
    settings?: any;
    stationPlaytimes?: any;
    driveToken?: string;
    driveTokenExpiresAt?: number;
    updatedAt?: string;
  } | null> {
    if (!syncKey) return null;
    const cleanKey = ('sync_' + syncKey.replace(/[^a-zA-Z0-9_-]/g, '_')).slice(0, 120);
    const docRef = doc(db, 'tesla_pairings', cleanKey);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return snap.data() as any;
      }
    } catch (err) {
      console.warn('[TeslaPairingService] Error reading paired preferences:', err);
    }
    return null;
  }

  /**
   * Listen for real-time preferences changes across paired devices
   */
  public subscribeToPairedPreferences(
    syncKey: string,
    onUpdate: (data: {
      favorites?: string[];
      favoriteStationObjects?: any[];
      deletedFavorites?: string[];
      settings?: any;
      driveToken?: string;
      driveTokenExpiresAt?: number;
      updatedAt?: string;
    }) => void
  ): () => void {
    if (!syncKey) return () => {};
    const cleanKey = ('sync_' + syncKey.replace(/[^a-zA-Z0-9_-]/g, '_')).slice(0, 120);
    const docRef = doc(db, 'tesla_pairings', cleanKey);
    return onSnapshot(
      docRef,
      snapshot => {
        if (snapshot.exists()) {
          onUpdate(snapshot.data() as any);
        }
      },
      err => {
        console.warn('Paired preferences subscription error:', err);
      }
    );
  }
}

export const teslaPairingService = new TeslaPairingService();
