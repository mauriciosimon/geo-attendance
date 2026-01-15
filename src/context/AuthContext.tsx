import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { Profile } from '../types';

// Only import expo-application on native platforms
let Application: any = null;
if (Platform.OS !== 'web') {
  Application = require('expo-application');
}

const SUPABASE_URL = 'https://ifkutaryzkimyjyuiwfx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlma3V0YXJ5emtpbXlqeXVpd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzE0MzAsImV4cCI6MjA4MzgwNzQzMH0.Xc4IHynmO0b7yJwx9ZzZjTNMWz99Jlp9p1OkAlH1veE';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  deviceError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get unique device identifier
async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'web') {
      // For web, use a combination of browser fingerprint stored in localStorage
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
      // iOS: Use identifierForVendor
      const iosId = await Application.getIosIdForVendorAsync();
      return iosId || `ios_${Date.now()}`;
    } else if (Application) {
      // Android: Use androidId
      return Application.getAndroidId() || `android_${Date.now()}`;
    }
    return `native_${Date.now()}`;
  } catch (err) {
    console.error('Error getting device ID:', err);
    return `fallback_${Date.now()}`;
  }
}

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || SUPABASE_ANON_KEY;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const fetchProfile = async (userId: string, accessToken?: string): Promise<Profile | null> => {
    console.log('fetchProfile: Querying for userId', userId);
    try {
      const token = accessToken || SUPABASE_ANON_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      const data = await response.json();
      console.log('fetchProfile: Result', data);

      if (data && data.length > 0) {
        return data[0] as Profile;
      }
      return null;
    } catch (err) {
      console.error('fetchProfile: Exception', err);
      return null;
    }
  };

  const updateDeviceId = async (userId: string, deviceId: string, accessToken?: string): Promise<boolean> => {
    try {
      const token = accessToken || SUPABASE_ANON_KEY;
      console.log('updateDeviceId: Updating device for', userId);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ device_id: deviceId }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);
      console.log('updateDeviceId: Response', response.ok);
      return response.ok;
    } catch (err) {
      console.error('updateDeviceId: Exception', err);
      return false;
    }
  };

  const verifyAndBindDevice = async (userProfile: Profile, userId: string, accessToken?: string): Promise<boolean> => {
    try {
      const currentDeviceId = await getDeviceId();
      console.log('Device verification:', {
        profileDeviceId: userProfile.device_id,
        currentDeviceId,
        isAdmin: userProfile.role === 'admin'
      });

      // Admins bypass device binding
      if (userProfile.role === 'admin') {
        return true;
      }

      // If no device_id set, this is first login - bind the device
      if (!userProfile.device_id) {
        console.log('First login - binding device');
        const success = await updateDeviceId(userId, currentDeviceId, accessToken);
        console.log('Device binding result:', success);
        if (success) {
          userProfile.device_id = currentDeviceId;
        }
        return true;
      }

      // Verify device matches
      if (userProfile.device_id !== currentDeviceId) {
        console.log('Device mismatch - blocking access');
        setDeviceError('This account is registered to a different device. Contact your admin to change devices.');
        return false;
      }

      return true;
    } catch (err) {
      console.error('Device verification error:', err);
      // On error, allow access to avoid blocking users
      return true;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      if (profileData) {
        const deviceOk = await verifyAndBindDevice(profileData, user.id);
        if (deviceOk) {
          setProfile(profileData);
          setDeviceError(null);
        }
      }
    }
  };

  useEffect(() => {
    // Get initial session
    console.log('AuthContext: Getting session...');
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      console.log('AuthContext: Session result', { session: !!session, error });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          console.log('AuthContext: Fetching profile for', session.user.id);
          const profileData = await fetchProfile(session.user.id, session.access_token);
          console.log('AuthContext: Profile fetched', profileData);

          if (profileData) {
            const deviceOk = await verifyAndBindDevice(profileData, session.user.id, session.access_token);
            if (deviceOk) {
              setProfile(profileData);
            } else {
              // Device mismatch - sign out
              await supabase.auth.signOut();
              setSession(null);
              setUser(null);
            }
          } else {
            setProfile(null);
          }
        } catch (err) {
          console.error('AuthContext: Error in profile/device flow', err);
          setProfile(null);
        }
      }
      setLoading(false);
    }).catch((err) => {
      console.error('AuthContext: Error getting session', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            const profileData = await fetchProfile(session.user.id, session.access_token);
            if (profileData) {
              const deviceOk = await verifyAndBindDevice(profileData, session.user.id, session.access_token);
              if (deviceOk) {
                setProfile(profileData);
                setDeviceError(null);
              } else {
                // Device mismatch - sign out
                await supabase.auth.signOut();
                setSession(null);
                setUser(null);
              }
            } else {
              setProfile(null);
            }
          } catch (err) {
            console.error('AuthContext: Error in auth change handler', err);
            setProfile(null);
          }
        } else {
          setProfile(null);
          setDeviceError(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setDeviceError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'employee',
        },
      },
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setDeviceError(null);
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        deviceError,
        signIn,
        signUp,
        signOut,
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
