import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Railway API URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://geo-attendance-production.up.railway.app';

const TOKEN_KEY = 'geo_attendance_token';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      }
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  async setToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        await AsyncStorage.setItem(TOKEN_KEY, token);
      }
    } catch (error) {
      console.error('Error saving token:', error);
    }
  }

  async removeToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
      } else {
        await AsyncStorage.removeItem(TOKEN_KEY);
      }
    } catch (error) {
      console.error('Error removing token:', error);
    }
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient(API_BASE_URL);
export { TOKEN_KEY };
