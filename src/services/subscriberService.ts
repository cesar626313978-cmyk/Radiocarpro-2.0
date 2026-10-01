import { doc, setDoc, getDocs, collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';

export interface Subscriber {
  email: string;
  displayName: string;
  registeredAt: string;
  status: 'active' | 'free_beta' | 'pending';
  accessGranted: boolean;
  source: string;
}

export const ADMIN_EMAIL = 'cesar626313978@gmail.com';

/**
 * Validates if an email is a legitimate Gmail account
 */
export function isGmailAddress(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  return clean.endsWith('@gmail.com') || clean.endsWith('@googlemail.com');
}

/**
 * Generates a clean Firestore document ID from email
 */
function getSubscriberDocId(email: string): string {
  return 'sub_' + email.toLowerCase().trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

/**
 * Checks if current user/browser has active access
 */
export function getStoredAccessInfo(): { hasAccess: boolean; email: string | null } {
  try {
    const verified = localStorage.getItem('audiocar_access_verified') === 'true';
    const email = localStorage.getItem('audiocar_access_email');
    const paired = localStorage.getItem('radiostream_paired_user');
    
    if ((verified && email) || paired) {
      return { hasAccess: true, email: email || 'usuario_emparejado' };
    }
  } catch {}
  return { hasAccess: false, email: null };
}

/**
 * Registers a verified subscriber in Firestore, LocalStorage, and optional Google Sheets webhook
 */
export async function registerSubscriber(
  email: string,
  displayName?: string,
  source: string = 'landing_info'
): Promise<Subscriber> {
  const cleanEmail = email.toLowerCase().trim();
  const subscriberData: Subscriber = {
    email: cleanEmail,
    displayName: displayName?.trim() || cleanEmail.split('@')[0],
    registeredAt: new Date().toISOString(),
    status: 'active',
    accessGranted: true,
    source,
  };

  // 1. Save locally for instant access
  try {
    localStorage.setItem('audiocar_access_email', cleanEmail);
    localStorage.setItem('audiocar_access_verified', 'true');
    localStorage.setItem('audiocar_access_date', subscriberData.registeredAt);

    // Keep an offline backup cache of subscribers
    const existingCache = localStorage.getItem('audiocar_subscribers_cache');
    let list: Subscriber[] = existingCache ? JSON.parse(existingCache) : [];
    if (!list.some(s => s.email === cleanEmail)) {
      list.unshift(subscriberData);
      localStorage.setItem('audiocar_subscribers_cache', JSON.stringify(list.slice(0, 500)));
    }
  } catch (e) {
    console.warn('[SubscriberService] Error saving local access:', e);
  }

  // 2. Persist to Firestore
  try {
    const docRef = doc(db, 'subscribers', getSubscriberDocId(cleanEmail));
    await setDoc(docRef, subscriberData, { merge: true });
  } catch (error) {
    console.warn('[SubscriberService] Firestore subscriber save warning:', error);
  }

  // 3. Optional live Google Sheets webhook trigger
  triggerGoogleSheetWebhook(subscriberData).catch(() => {});

  return subscriberData;
}

/**
 * Sends subscriber data to Google Sheets via Webhook (Google Apps Script) if configured
 */
export async function triggerGoogleSheetWebhook(subscriber: Subscriber): Promise<boolean> {
  try {
    const webhookUrl = localStorage.getItem('audiocar_sheets_webhook_url');
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
      return false;
    }

    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: subscriber.email,
        name: subscriber.displayName,
        registeredAt: subscriber.registeredAt,
        status: subscriber.status,
        source: subscriber.source,
      }),
    });
    return true;
  } catch (e) {
    console.warn('[SubscriberService] Error triggering Google Sheets webhook:', e);
    return false;
  }
}

/**
 * Fetches all subscribers (for César's admin control)
 */
export async function getAllSubscribers(): Promise<Subscriber[]> {
  const result: Subscriber[] = [];
  const seen = new Set<string>();

  // 1. Try Firestore
  try {
    const q = query(collection(db, 'subscribers'), orderBy('registeredAt', 'desc'), limit(1000));
    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
      const data = docSnap.data() as Subscriber;
      if (data.email && !seen.has(data.email)) {
        seen.add(data.email);
        result.push(data);
      }
    });
  } catch (e) {
    console.warn('[SubscriberService] Error loading remote subscribers, using cache:', e);
  }

  // 2. Supplement with local cache
  try {
    const cached = localStorage.getItem('audiocar_subscribers_cache');
    if (cached) {
      const parsed: Subscriber[] = JSON.parse(cached);
      parsed.forEach(sub => {
        if (sub.email && !seen.has(sub.email)) {
          seen.add(sub.email);
          result.push(sub);
        }
      });
    }
  } catch {}

  // 3. Supplement with current logged-in user if not already in list
  try {
    const currentEmail = localStorage.getItem('audiocar_access_email');
    if (currentEmail && !seen.has(currentEmail)) {
      result.unshift({
        email: currentEmail,
        displayName: currentEmail.split('@')[0],
        registeredAt: new Date().toISOString(),
        status: 'active',
        accessGranted: true,
        source: 'local_registration',
      });
    }
  } catch {}

  return result;
}

/**
 * Exports subscribers to a clean UTF-8 CSV ready for Google Sheets or Excel
 */
export function exportSubscribersToCSV(subscribers: Subscriber[]): void {
  const headers = ['Email', 'Nombre / Display Name', 'Fecha de Registro', 'Estado', 'Origen'];
  const rows = subscribers.map(s => [
    `"${s.email.replace(/"/g, '""')}"`,
    `"${(s.displayName || '').replace(/"/g, '""')}"`,
    `"${new Date(s.registeredAt).toLocaleString('es-ES')}"`,
    `"${s.status}"`,
    `"${s.source || 'landing'}"`,
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `audiocar_pro_usuarios_sheets_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
