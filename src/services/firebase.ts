import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Alarm, RadioStation } from '../types/radio';

export { onAuthStateChanged };
export type { User };

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test Firestore connection on boot (Firebase integration requirement)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
    }
  }
}
testConnection();

import { googleDriveService } from './googleDriveService';

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Track if quota has been exceeded to avoid spamming the backend
let isQuotaExceeded = false;

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errMsg = error instanceof Error ? error.message : String(error);

  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded')) {
    isQuotaExceeded = true;
    console.warn('Firestore free quota limit reached for today. Using local storage fallback gracefully.');
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

/**
 * Detects whether the current environment is a Tesla vehicle in-car browser
 */
export function isTeslaBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    ua.includes('Tesla') ||
    ua.includes('QtCarBrowser') ||
    (ua.includes('Linux') && typeof window !== 'undefined' && window.innerWidth >= 1100 && !ua.includes('Android'))
  );
}

/**
 * Sign in with Google (supports automatic Tesla Redirect to avoid broken popup tabs)
 */
export async function signInWithGoogle(forceRedirect = false): Promise<User | null> {
  const isTesla = isTeslaBrowser();
  if (isTesla || forceRedirect) {
    console.log('Tesla / In-Car browser detected: using signInWithRedirect');
    try {
      localStorage.setItem('radiostream_redirect_initiated', 'true');
    } catch {}
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      googleDriveService.setAccessToken(credential.accessToken);
    }
    return result.user;
  } catch (error: any) {
    console.warn('Google Popup Sign In failed, attempting fallback to Redirect:', error);
    // If popup blocked or tab closed (common in Tesla and mobile browsers)
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request' ||
      error.code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        localStorage.setItem('radiostream_redirect_initiated', 'true');
      } catch {}
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw error;
  }
}

/**
 * Handles credentials when returning from a Google redirect
 */
export async function handleRedirectAuth(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        googleDriveService.setAccessToken(credential.accessToken);
      }
      return result.user;
    }
  } catch (error) {
    console.warn('Redirect Auth Result:', error);
  }
  return null;
}

/**
 * Sign out
 */
export async function logOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Sign Out Error:', error);
    throw error;
  }
}

let saveDebounceTimer: number | null = null;
let pendingSave: {
  userId: string;
  data: {
    favorites: string[];
    favoriteStationObjects?: RadioStation[];
    alarms: Alarm[];
    totalMinutesListened?: number;
    settings?: Record<string, unknown>;
  };
} | null = null;

async function executeFirestoreSave(
  userId: string,
  data: {
    favorites: string[];
    favoriteStationObjects?: RadioStation[];
    alarms: Alarm[];
    totalMinutesListened?: number;
    settings?: Record<string, unknown>;
  }
): Promise<void> {
  if (isQuotaExceeded || !userId) return;
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(
      userRef,
      {
        userId,
        email: auth.currentUser?.email || '',
        displayName: auth.currentUser?.displayName || '',
        photoURL: auth.currentUser?.photoURL || '',
        favorites: data.favorites || [],
        favoriteStationObjects: data.favoriteStationObjects || [],
        alarms: data.alarms || [],
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`[Firestore] Sincronización guardada exitosamente (${data.favorites.length} favoritas) para UID: ${userId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Flush any pending preferences save immediately and await completion (used before sign out)
 */
export async function flushPendingPreferencesSave(userId?: string): Promise<void> {
  if (saveDebounceTimer) {
    window.clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  if (pendingSave) {
    const payload = pendingSave;
    pendingSave = null;
    await executeFirestoreSave(userId || payload.userId, payload.data);
  }
}

/**
 * Sync user preferences (Favorites, Alarms) to Firestore with immediate option or debouncing
 */
export async function saveUserPreferencesToFirestore(
  userId: string,
  data: {
    favorites: string[];
    favoriteStationObjects?: RadioStation[];
    alarms: Alarm[];
    totalMinutesListened?: number;
    settings?: Record<string, unknown>;
  },
  immediate = false
): Promise<void> {
  if (isQuotaExceeded || !userId) {
    return;
  }

  if (saveDebounceTimer) {
    window.clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  pendingSave = { userId, data };

  if (immediate) {
    pendingSave = null;
    await executeFirestoreSave(userId, data);
    return;
  }

  return new Promise<void>(resolve => {
    saveDebounceTimer = window.setTimeout(async () => {
      saveDebounceTimer = null;
      if (pendingSave) {
        const payload = pendingSave;
        pendingSave = null;
        await executeFirestoreSave(payload.userId, payload.data);
      }
      resolve();
    }, 400);
  });
}

/**
 * Load user preferences from Firestore
 */
export async function loadUserPreferencesFromFirestore(userId: string): Promise<{
  favorites?: string[];
  favoriteStationObjects?: RadioStation[];
  alarms?: Alarm[];
  updatedAt?: string;
  [key: string]: any;
} | null> {
  if (isQuotaExceeded || !userId) return null;
  const path = `users/${userId}`;
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as any;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Listen to user preferences changes in real-time
 */
export function subscribeToUserPreferences(
  userId: string,
  onUpdate: (data: any) => void
) {
  if (isQuotaExceeded || !userId) {
    return () => {};
  }
  const path = `users/${userId}`;
  const userRef = doc(db, 'users', userId);
  try {
    return onSnapshot(
      userRef,
      docSnap => {
        if (docSnap.exists()) {
          onUpdate(docSnap.data());
        }
      },
      error => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return () => {};
  }
}
