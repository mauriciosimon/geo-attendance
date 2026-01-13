import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { Profile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<Profile | null> => {
    console.log('fetchProfile: Querying for userId', userId);
    try {
      // Use fetch directly to avoid Supabase client issues
      const response = await fetch(
        `https://ifkutaryzkimyjyuiwfx.supabase.co/rest/v1/profiles?id=eq.${userId}&select=*`,
        {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlma3V0YXJ5emtpbXlqeXVpd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzE0MzAsImV4cCI6MjA4MzgwNzQzMH0.Xc4IHynmO0b7yJwx9ZzZjTNMWz99Jlp9p1OkAlH1veE',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlma3V0YXJ5emtpbXlqeXVpd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzE0MzAsImV4cCI6MjA4MzgwNzQzMH0.Xc4IHynmO0b7yJwx9ZzZjTNMWz99Jlp9p1OkAlH1veE`,
          },
        }
      );

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

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    // Get initial session
    console.log('AuthContext: Getting session...');
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('AuthContext: Session result', { session: !!session, error });
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        console.log('AuthContext: Fetching profile for', session.user.id);
        fetchProfile(session.user.id).then((profile) => {
          console.log('AuthContext: Profile fetched', profile);
          setProfile(profile);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
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
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
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
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
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
