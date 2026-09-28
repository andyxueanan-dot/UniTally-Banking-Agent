import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Transaction, Wallet, Category, Platform, ThemeMode, User, Budget, Subscription, UIStyle } from '@/types';
import { STORAGE_KEYS, USER_DATA_KEYS, loadFromStorage, saveToStorage, loadUserData, saveUserData, clearUserData } from '@/lib/storage';
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS } from '@/lib/defaults';
import { fetchLatestRate, fetchHistoricalRates } from '@/lib/exchangeRates';
import { authService } from '@/lib/auth';
import { translations, type Language } from '@/lib/i18n';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PLAN_FEATURES } from '@/lib/plans';

interface AppContextType {
  user: User | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  transactions: Transaction[];
  wallets: Wallet[];
  categories: Category[];
  platforms: Platform[];
  budgets: Budget[];
  subscriptions: Subscription[];
  theme: ThemeMode;
  themeColor: string;
  uiStyle: UIStyle;
  language: Language;
  avatar: string | null;
  setupCompleted: boolean;
  bookName: string;
  currencies: string[];
  primaryCurrency: string;
  secondaryCurrency: string;
  latestRate: number;
  rateLoading: boolean;
  t: typeof translations.zh;
  isPremium: boolean;

  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;

  addTransaction: (t: Omit<Transaction, 'id' | 'createdAt'>) => void;
  updateTransaction: (t: Transaction) => void;
  deleteTransaction: (id: string) => void;
  clearTransactions: () => void;

  addWallet: (w: Omit<Wallet, 'id'>) => void;
  updateWallet: (w: Wallet) => void;
  deleteWallet: (id: string) => void;
  reorderWallets: (wallets: Wallet[]) => void;

  addCategory: (c: Omit<Category, 'id'>) => void;
  updateCategory: (c: Category) => void;
  deleteCategory: (id: string) => void;
  reorderCategories: (cats: Category[]) => void;
  resetCategories: () => void;

  addPlatform: (p: Omit<Platform, 'id'>) => void;
  updatePlatform: (p: Platform) => void;
  deletePlatform: (id: string) => void;
  resetPlatforms: () => void;

  addBudget: (b: Omit<Budget, 'id' | 'createdAt'>) => void;
  updateBudget: (b: Budget) => void;
  deleteBudget: (id: string) => void;

  addSubscription: (s: Omit<Subscription, 'id' | 'createdAt'>) => void;
  updateSubscription: (s: Subscription) => void;
  deleteSubscription: (id: string) => void;

  setTheme: (t: ThemeMode) => void;
  setThemeColor: (c: string) => void;
  setUIStyle: (s: UIStyle) => void;
  setLanguage: (l: Language) => void;
  setAvatar: (a: string | null) => void;
  setSetupCompleted: (v: boolean) => void;
  setBookName: (n: string) => void;
  setCurrencies: (c: string[]) => void;
  addCurrency: (c: string) => boolean;
  removeCurrency: (c: string) => boolean;
  setPrimaryCurrency: (c: string) => void;
  refreshRates: (from?: string, to?: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const subscription = useSubscription();
  const isPremium = subscription.isPremium;
  
  const [user, setUser] = useState<User | null>(() =>
    loadFromStorage(STORAGE_KEYS.USER, null)
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    authService.isAuthenticated()
  );
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    loadFromStorage(STORAGE_KEYS.THEME, 'light')
  );
  const [themeColor, setThemeColorState] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.THEME_COLOR, 'blue')
  );
  const [uiStyle, setUIStyleState] = useState<UIStyle>(() =>
    loadFromStorage(STORAGE_KEYS.UI_STYLE, 'default')
  );
  const [language, setLanguageState] = useState<Language>(() =>
    loadFromStorage(STORAGE_KEYS.LANGUAGE, 'zh')
  );
  const [setupCompleted, setSetupCompletedState] = useState<boolean>(false);
  const [bookName, setBookNameState] = useState<string>('');
  const [currencies, setCurrenciesState] = useState<string[]>(() =>
    loadFromStorage(STORAGE_KEYS.CURRENCIES, ['CNY', 'MYR'])
  );
  const [latestRate, setLatestRate] = useState(1);
  const [rateLoading, setRateLoading] = useState(false);
  
  const t = translations[language];

  const primaryCurrency = currencies[0] || 'CNY';
  const secondaryCurrency = currencies[1] || 'MYR';

  const mergeWithDefaults = <T extends { id: string }>(existing: T[], defaults: T[]): T[] => {
    const existingIds = new Set(existing.map(item => item.id));
    const defaultIds = new Set(defaults.map(item => item.id));
    
    const merged = [...existing];
    
    for (const defaultItem of defaults) {
      if (!existingIds.has(defaultItem.id)) {
        merged.push(defaultItem);
      }
    }
    
    return merged.filter(item => defaultIds.has(item.id));
  };

  useEffect(() => {
    if (user?.id) {
      const userTransactions = loadUserData<Transaction[]>(user.id, USER_DATA_KEYS.TRANSACTIONS, []);
      const userWallets = loadUserData<Wallet[]>(user.id, USER_DATA_KEYS.WALLETS, []);
      const userCategories = loadUserData<Category[]>(user.id, USER_DATA_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
      const userPlatforms = loadUserData<Platform[]>(user.id, USER_DATA_KEYS.PLATFORMS, DEFAULT_PLATFORMS);
      const userAvatar = loadUserData<string | null>(user.id, USER_DATA_KEYS.AVATAR, null);
      const userSetupCompleted = loadUserData<boolean>(user.id, USER_DATA_KEYS.SETUP_COMPLETED, false);
      const userBookName = loadUserData<string>(user.id, USER_DATA_KEYS.BOOK_NAME, '');
      
      setTransactions(userTransactions);
      setWallets(userWallets);
      
      const mergedCategories = mergeWithDefaults(userCategories, DEFAULT_CATEGORIES);
      setCategories(mergedCategories);
      
      setPlatforms(userPlatforms);
      setAvatarState(userAvatar);
      setSetupCompletedState(userSetupCompleted);
      setBookNameState(userBookName);
    } else {
      setTransactions([]);
      setWallets([]);
      setCategories(DEFAULT_CATEGORIES);
      setPlatforms(DEFAULT_PLATFORMS);
      setAvatarState(null);
      setSetupCompletedState(false);
      setBookNameState('');
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.TRANSACTIONS, transactions);
    }
  }, [transactions, user?.id]);

  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.WALLETS, wallets);
    }
  }, [wallets, user?.id]);

  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.CATEGORIES, categories);
    }
  }, [categories, user?.id]);

  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.PLATFORMS, platforms);
    }
  }, [platforms, user?.id]);

  useEffect(() => { saveToStorage(STORAGE_KEYS.THEME, theme); }, [theme]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.THEME_COLOR, themeColor); }, [themeColor]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.UI_STYLE, uiStyle); }, [uiStyle]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.LANGUAGE, language); }, [language]);
  useEffect(() => { 
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.SETUP_COMPLETED, setupCompleted);
    }
  }, [setupCompleted, user?.id]);
  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.BOOK_NAME, bookName);
    }
  }, [bookName, user?.id]);
  useEffect(() => { saveToStorage(STORAGE_KEYS.CURRENCIES, currencies); }, [currencies]);

  const [avatar, setAvatarState] = useState<string | null>(null);
  
  useEffect(() => {
    if (user?.id) {
      saveUserData(user.id, USER_DATA_KEYS.AVATAR, avatar);
    }
  }, [avatar, user?.id]);

  useEffect(() => {
    const initAuth = async () => {
      setAuthLoading(true);
      try {
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);
        setIsAuthenticated(authService.isAuthenticated());
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (themeColor === 'blue') {
      document.documentElement.removeAttribute('data-theme-color');
    } else {
      document.documentElement.setAttribute('data-theme-color', themeColor);
    }
  }, [themeColor]);

  useEffect(() => {
    if (uiStyle === 'default') {
      document.documentElement.removeAttribute('data-ui-style');
    } else {
      document.documentElement.setAttribute('data-ui-style', uiStyle);
    }
  }, [uiStyle]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const refreshRates = useCallback(async (from?: string, to?: string) => {
    const fromCurrency = from || primaryCurrency;
    const toCurrency = to || secondaryCurrency;
    if (fromCurrency === toCurrency) {
      setLatestRate(1);
      return;
    }
    setRateLoading(true);
    try {
      const rate = await fetchLatestRate(fromCurrency, toCurrency);
      setLatestRate(rate);
    } catch (error) {
      console.warn('Failed to refresh exchange rates:', error);
    }
    setRateLoading(false);
  }, [primaryCurrency, secondaryCurrency]);

  useEffect(() => {
    refreshRates();
  }, [refreshRates]);

  const addTransaction = useCallback((t: Omit<Transaction, 'id' | 'createdAt'>) => {
    setTransactions(prev => [{ ...t, id: genId(), createdAt: Date.now() }, ...prev]);
  }, []);
  const updateTransaction = useCallback((t: Transaction) => {
    setTransactions(prev => prev.map(x => x.id === t.id ? t : x));
  }, []);
  const deleteTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(x => x.id !== id));
  }, []);
  const clearTransactions = useCallback(() => {
    setTransactions([]);
  }, []);

  const addWallet = useCallback((w: Omit<Wallet, 'id'>) => {
    setWallets(prev => [...prev, { ...w, id: genId() }]);
  }, []);
  const updateWallet = useCallback((w: Wallet) => {
    setWallets(prev => prev.map(x => x.id === w.id ? w : x));
  }, []);
  const deleteWallet = useCallback((id: string) => {
    setWallets(prev => prev.filter(x => x.id !== id));
  }, []);
  const reorderWallets = useCallback((w: Wallet[]) => setWallets(w), []);

  const addCategory = useCallback((c: Omit<Category, 'id'>) => {
    setCategories(prev => [...prev, { ...c, id: genId() }]);
  }, []);
  const updateCategory = useCallback((c: Category) => {
    setCategories(prev => prev.map(x => x.id === c.id ? c : x));
  }, []);
  const deleteCategory = useCallback((id: string) => {
    if (id === 'transfer') return;
    setCategories(prev => prev.filter(x => x.id !== id));
  }, []);
  const reorderCategories = useCallback((c: Category[]) => setCategories(c), []);

  const addPlatform = useCallback((p: Omit<Platform, 'id'>) => {
    setPlatforms(prev => [...prev, { ...p, id: genId() }]);
  }, []);
  const updatePlatform = useCallback((p: Platform) => {
    setPlatforms(prev => prev.map(x => x.id === p.id ? p : x));
  }, []);
  const deletePlatform = useCallback((id: string) => {
    setPlatforms(prev => prev.filter(x => x.id !== id));
  }, []);

  const addBudget = useCallback((b: Omit<Budget, 'id' | 'createdAt'>) => {
    setBudgets(prev => [...prev, { ...b, id: genId(), createdAt: Date.now() }]);
  }, []);
  const updateBudget = useCallback((b: Budget) => {
    setBudgets(prev => prev.map(x => x.id === b.id ? b : x));
  }, []);
  const deleteBudget = useCallback((id: string) => {
    setBudgets(prev => prev.filter(x => x.id !== id));
  }, []);

  const addSubscription = useCallback((s: Omit<Subscription, 'id' | 'createdAt'>) => {
    setSubscriptions(prev => [...prev, { ...s, id: genId(), createdAt: Date.now() }]);
  }, []);
  const updateSubscription = useCallback((s: Subscription) => {
    setSubscriptions(prev => prev.map(x => x.id === s.id ? s : x));
  }, []);
  const deleteSubscription = useCallback((id: string) => {
    setSubscriptions(prev => prev.filter(x => x.id !== id));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAuthLoading(true);
    try {
      const { user } = await authService.login(email, password);
      setUser(user);
      setIsAuthenticated(true);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    try {
      const { user } = await authService.loginWithGoogle();
      setUser(user);
      setIsAuthenticated(true);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setAuthLoading(true);
    try {
      const { user } = await authService.register(email, password, name);
      setUser(user);
      setIsAuthenticated(true);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    setSetupCompletedState(false);
    setTransactions([]);
    setWallets([]);
    setCategories(DEFAULT_CATEGORIES);
    setPlatforms(DEFAULT_PLATFORMS);
    setAvatarState(null);
  }, []);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);
  const setThemeColor = useCallback((c: string) => setThemeColorState(c), []);
  const setUIStyle = useCallback((s: UIStyle) => setUIStyleState(s), []);
  const setLanguage = useCallback((l: Language) => setLanguageState(l), []);
  const setAvatar = useCallback((a: string | null) => setAvatarState(a), []);
  const setSetupCompleted = useCallback((v: boolean) => setSetupCompletedState(v), []);
  const setBookName = useCallback((n: string) => setBookNameState(n), []);
  
  const setCurrencies = useCallback((c: string[]) => {
    setCurrenciesState(c);
  }, []);

  const addCurrency = useCallback((c: string): boolean => {
    if (currencies.includes(c)) return false;
    setCurrenciesState(prev => [...prev, c]);
    return true;
  }, [currencies]);

  const removeCurrency = useCallback((c: string): boolean => {
    if (currencies.length <= 2) return false;
    if (c === primaryCurrency) return false;
    setCurrenciesState(prev => prev.filter(cur => cur !== c));
    return true;
  }, [currencies, primaryCurrency]);

  const setPrimaryCurrency = useCallback((c: string) => {
    setCurrenciesState(prev => {
      const filtered = prev.filter(cur => cur !== c);
      return [c, ...filtered];
    });
  }, []);

  const resetCategories = useCallback(() => {
    setCategories(DEFAULT_CATEGORIES);
    if (user) {
      saveUserData(user.id, USER_DATA_KEYS.CATEGORIES, DEFAULT_CATEGORIES);
    }
  }, [user]);

  const resetPlatforms = useCallback(() => {
    setPlatforms(DEFAULT_PLATFORMS);
    if (user) {
      saveUserData(user.id, USER_DATA_KEYS.PLATFORMS, DEFAULT_PLATFORMS);
    }
  }, [user]);

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, authLoading,
      transactions, wallets, categories, platforms, budgets, subscriptions, theme, themeColor, uiStyle, language, avatar, setupCompleted, bookName,
      currencies, primaryCurrency, secondaryCurrency, latestRate, rateLoading, t,
      isPremium,
      login, loginWithGoogle, register, logout,
      addTransaction, updateTransaction, deleteTransaction, clearTransactions,
      addWallet, updateWallet, deleteWallet, reorderWallets,
      addCategory, updateCategory, deleteCategory, reorderCategories, resetCategories,
      addPlatform, updatePlatform, deletePlatform, resetPlatforms,
      addBudget, updateBudget, deleteBudget,
      addSubscription, updateSubscription, deleteSubscription,
      setTheme, setThemeColor, setUIStyle, setLanguage, setAvatar, setSetupCompleted, setBookName,
      setCurrencies, addCurrency, removeCurrency, setPrimaryCurrency, refreshRates,
    }}>
      {children}
    </AppContext.Provider>
  );
}
