import { User } from '@/types';
import { STORAGE_KEYS, saveToStorage, loadFromStorage } from './storage';
import { signInWithGoogle, getIdToken } from './firebase';

class AuthService {
  private baseUrl = 'http://localhost:5000/api/auth';

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const response = await fetch(`${this.baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    saveToStorage(STORAGE_KEYS.USER, data.user);
    saveToStorage(STORAGE_KEYS.AUTH_TOKEN, data.token);
    return { user: data.user, token: data.token };
  }

  async loginWithGoogle(): Promise<{ user: User; token: string }> {
    const { user: firebaseUser, token: idToken } = await signInWithGoogle();
    
    const response = await fetch(`${this.baseUrl}/firebase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        email: firebaseUser.email,
        name: firebaseUser.displayName,
        picture: firebaseUser.photoURL,
        uid: firebaseUser.uid
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Google login failed');
    }

    const data = await response.json();
    saveToStorage(STORAGE_KEYS.USER, data.user);
    saveToStorage(STORAGE_KEYS.AUTH_TOKEN, data.token);
    return { user: data.user, token: data.token };
  }

  async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const response = await fetch(`${this.baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    saveToStorage(STORAGE_KEYS.USER, data.user);
    saveToStorage(STORAGE_KEYS.AUTH_TOKEN, data.token);
    return { user: data.user, token: data.token };
  }

  async forgotPassword(email: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send reset password email');
    }
  }

  async resetPassword(token: string, email: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Password reset failed');
    }
  }

  logout(): void {
    saveToStorage(STORAGE_KEYS.USER, null);
    saveToStorage(STORAGE_KEYS.AUTH_TOKEN, null);
  }

  getCurrentUser(): User | null {
    return loadFromStorage<User | null>(STORAGE_KEYS.USER, null);
  }

  isAuthenticated(): boolean {
    const token = loadFromStorage<string | null>(STORAGE_KEYS.AUTH_TOKEN, null);
    return !!token;
  }
}

export const authService = new AuthService();
