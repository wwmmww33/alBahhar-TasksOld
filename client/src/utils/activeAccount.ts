// utils/activeAccount.ts
// إدارة حالة "العمل نيابة عن" عبر localStorage

export type ActiveAccount = {
  userId: string;
  userName?: string | null;
  mode: 'self' | 'delegation';
};

const STORAGE_KEY = 'albahar-active-account';

export function getActiveAccount(): ActiveAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.userId !== 'string') return null;
    return obj as ActiveAccount;
  } catch {
    return null;
  }
}

export function getActiveUserId(fallbackUserId?: string): string {
  const acc = getActiveAccount();
  return acc?.userId || fallbackUserId || '';
}

export function setActiveAccount(account: ActiveAccount) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
  } catch {}
}

export function clearActiveAccount() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}