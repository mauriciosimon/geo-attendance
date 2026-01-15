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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [blockedUserId, setBlockedUserId] = useState<string | null>(null);
  const [blockedUserEmail, setBlockedUserEmail] = useState<string | null>(null);
  const [blockedAccessToken, setBlockedAccessToken] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);

  const fetchProfile = async (userId: string, accessToken?: string): Promise<Profile | null> => {
    console.log('fetchProfile: Querying for userId', userId);
    try {
      const token = accessToken || SUPABASE_ANON_KEY;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

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

  const requestDeviceReset = async (): Promise<boolean> => {
    if (!blockedUserId || !blockedAccessToken) {
      console.error('No blocked user to request reset for');
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${blockedUserId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${blockedAccessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ device_reset_requested: true }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        setResetRequested(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('requestDeviceReset: Exception', err);
      return false;
    }
  };

  const verifyAndBindDevice = async (
    userProfile: Profile,
    userId: string,
    userEmail: string,
    accessToken?: string
  ): Promise<boolean> => {
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
        setDeviceBlocked(true);
        setBlockedUserId(userId);
        setBlockedUserEmail(userEmail);
        setBlockedAccessToken(accessToken || null);
        setResetRequested(userProfile.device_reset_requested || false);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Device verification error:', err);
      return true;
    }
  };

  const refreshProfile = async () => {
    if (user && session) {
      const profileData = await fetchProfile(user.id, session.access_token);
      if (profileData) {
        const deviceOk = await verifyAndBindDevice(profileData, user.id, user.email || '', session.access_token);
        if (deviceOk) {
          setProfile(profileData);
          setDeviceBlocked(false);
        }
      }
    }
  };

  useEffect(() => {
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
            const deviceOk = await verifyAndBindDevice(
              profileData,
              session.user.id,
              session.user.email || '',
              session.access_token
            );
            if (deviceOk) {
              setProfile(profileData);
              setDeviceBlocked(false);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          try {
            const profileData = await fetchProfile(session.user.id, session.access_token);
            if (profileData) {
              const deviceOk = await verifyAndBindDevice(
                profileData,
                session.user.id,
                session.user.email || '',
                session.access_token
              );
              if (deviceOk) {
                setProfile(profileData);
                setDeviceBlocked(false);
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
          setDeviceBlocked(false);
          setBlockedUserId(null);
          setBlockedUserEmail(null);
          setBlockedAccessToken(null);
          setResetRequested(false);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setDeviceBlocked(false);
    setResetRequested(false);
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
    setDeviceBlocked(false);
    setBlockedUserId(null);
    setBlockedUserEmail(null);
    setBlockedAccessToken(null);
    setResetRequested(false);
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
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
