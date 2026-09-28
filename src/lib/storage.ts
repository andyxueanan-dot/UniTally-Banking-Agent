const STORAGE_KEYS = {
  USER: 'mcb_user',
  AUTH_TOKEN: 'mcb_auth_token',
  THEME: 'mcb_theme',
  THEME_COLOR: 'mcb_theme_color',
  UI_STYLE: 'mcb_ui_style',
  LANGUAGE: 'mcb_language',
  SETUP_COMPLETED: 'mcb_setup_completed',
  CURRENCIES: 'mcb_currencies',
  EXCHANGE_RATES: 'mcb_exchange_rates',
} as const;

const USER_DATA_KEYS = {
  TRANSACTIONS: 'transactions',
  WALLETS: 'wallets',
  CATEGORIES: 'categories',
  PLATFORMS: 'platforms',
  AVATAR: 'avatar',
  SETUP_COMPLETED: 'setup_completed',
  BOOK_NAME: 'book_name',
} as const;

function getUserDataKey(userId: string, key: string): string {
  return `mcb_${userId}_${key}`;
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to load from storage key "${key}":`, error);
  }
  return fallback;
}

export function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save to storage key "${key}":`, error);
  }
}

export function loadUserData<T>(userId: string, key: string, fallback: T): T {
  const storageKey = getUserDataKey(userId, key);
  return loadFromStorage(storageKey, fallback);
}

export function saveUserData(userId: string, key: string, value: unknown) {
  const storageKey = getUserDataKey(userId, key);
  saveToStorage(storageKey, value);
}

export function clearUserData(userId: string) {
  Object.values(USER_DATA_KEYS).forEach(key => {
    localStorage.removeItem(getUserDataKey(userId, key));
  });
}

export const storage = {
  get: <T>(key: string, fallback?: T): T => {
    return loadFromStorage(key, fallback as T);
  },
  set: (key: string, value: unknown) => {
    saveToStorage(key, value);
  },
  remove: (key: string) => {
    localStorage.removeItem(key);
  },
};

export { STORAGE_KEYS, USER_DATA_KEYS };
