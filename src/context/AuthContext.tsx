import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from '../config/api';
import { Profile } from '../types';

// Only import expo-application on native platforms
let Application: any = null;
if (Platform.OS !== 'web') {
  Application = require('expo-application');
}

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  deviceBlocked: boolean;
  blockedUserEmail: string | null;
  resetRequested: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  requestDeviceReset: () => Promise<boolean>;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get unique device identifier
async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.localStorage) {
        let webDeviceId = window.localStorage.getItem('geo_attendance_device_id');
        if (!webDeviceId) {
          webDeviceId = `web_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          window.localStorage.setItem('geo_attendance_device_id', webDeviceId);
        }
        return webDeviceId;
      }
      return `web_${Date.now()}`;
    } else if (Platform.OS === 'ios' && Application) {
      const iosId = await Application.getIosIdForVendorAsync();
      return iosId || `ios_${Date.now()}`;
    } else if (Application) {
      return Application.getAndroidId() || `android_${Date.now()}`;
    }
    return `native_${Date.now()}`;
  } catch (err) {
    console.error('Error getting device ID:', err);
    return `fallback_${Date.now()}`;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [blockedUserEmail, setBlockedUserEmail] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);

  const verifyAndBindDevice = async (profile: Profile): Promise<boolean> => {
    try {
      const currentDeviceId = await getDeviceId();
      console.log('Device verification:', {
        profileDeviceId: profile.device_id,
        currentDeviceId,
        isAdmin: profile.role === 'admin'
      });

      // Admins bypass device binding
      if (profile.role === 'admin') {
        return true;
      }

      // If no device_id set, this is first login - bind the device
      if (!profile.device_id) {
        console.log('First login - binding device');
        try {
          const updatedUser = await api.patch<Profile>('/api/users/device', {
            device_id: currentDeviceId,
          });
          setUser(updatedUser);
        } catch (err) {
          console.error('Error binding device:', err);
        }
        return true;
      }

      // Verify device matches
      if (profile.device_id !== currentDeviceId) {
        console.log('Device mismatch - blocking access');
        setDeviceBlocked(true);
        setBlockedUserEmail(profile.email);
        setResetRequested(profile.device_reset_requested || false);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Device verification error:', err);
      return true;
    }
  };

  const fetchProfile = async (): Promise<Profile | null> => {
    try {
      const profile = await api.get<Profile>('/api/users/profile');
      return profile;
    } catch (err) {
      console.error('Error fetching profile:', err);
      return null;
    }
  };

  const refreshProfile = async () => {
    const profile = await fetchProfile();
    if (profile) {
      const deviceOk = await verifyAndBindDevice(profile);
      if (deviceOk) {
        setUser(profile);
        setDeviceBlocked(false);
      }
    }
  };

  const checkAuth = async () => {
    try {
      const token = await api.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const profile = await fetchProfile();
      if (profile) {
        const deviceOk = await verifyAndBindDevice(profile);
        if (deviceOk) {
          setUser(profile);
          setDeviceBlocked(false);
        }
      }
    } catch (err) {
      console.error('Auth check error:', err);
      await api.removeToken();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    setDeviceBlocked(false);
    setResetRequested(false);

    try {
      const result = await api.post<{ user: Profile; token: string }>('/api/auth/login', {
        email,
        password,
      });

      await api.setToken(result.token);

      const deviceOk = await verifyAndBindDevice(result.user);
      if (deviceOk) {
        setUser(result.user);
      }

      return { error: null };
    } catch (error: any) {
      return { error: new Error(error.message) };
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const result = await api.post<{ user: Profile; token: string }>('/api/auth/register', {
        email,
        password,
        full_name: fullName,
      });

      await api.setToken(result.token);
      setUser(result.user);

      return { error: null };
    } catch (error: any) {
      return { error: new Error(error.message) };
    }
  };

  const signOut = async () => {
    await api.removeToken();
    setUser(null);
    setDeviceBlocked(false);
    setBlockedUserEmail(null);
    setResetRequested(false);
  };

  const requestDeviceReset = async (): Promise<boolean> => {
    try {
      await api.post('/api/users/request-device-reset');
      setResetRequested(true);
      return true;
    } catch (err) {
      console.error('Error requesting device reset:', err);
      return false;
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        deviceBlocked,
        blockedUserEmail,
        resetRequested,
        signIn,
        signUp,
        signOut,
        requestDeviceReset,
        isAdmin,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
