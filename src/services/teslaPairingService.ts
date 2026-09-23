import { doc, setDoc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface TeslaPairingData {
  code: string;
  status: 'pending' | 'paired' | 'expired';
  token?: string;
  userEmail?: string;
  userDisplayName?: string;
  userPhoto?: string;
  createdAt: string;
  pairedAt?: string;
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
    userInfo: { email?: string; displayName?: string; photoURL?: string }
  ): Promise<void> {
    const docRef = doc(db, 'tesla_pairings', code);
    await updateDoc(docRef, {
      status: 'paired',
      token,
      userEmail: userInfo.email || '',
      userDisplayName: userInfo.displayName || '',
      userPhoto: userInfo.photoURL || '',
      pairedAt: new Date().toISOString(),
    });
  }
}

export const teslaPairingService = new TeslaPairingService();
