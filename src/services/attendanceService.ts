import { AttendanceRecord, AttendanceStatus, Coordinates } from '../types';
import { supabase } from '../config/supabase';

const SUPABASE_URL = 'https://ifkutaryzkimyjyuiwfx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlma3V0YXJ5emtpbXlqeXVpd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzE0MzAsImV4cCI6MjA4MzgwNzQzMH0.Xc4IHynmO0b7yJwx9ZzZjTNMWz99Jlp9p1OkAlH1veE';

async function getAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || SUPABASE_ANON_KEY;
}

async function fetchFromSupabase(endpoint: string, options?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options?.headers,
    },
    ...options,
  });
  return response;
}

export async function recordAttendance(
  userId: string,
  status: AttendanceStatus,
  coordinates: Coordinates,
  locationId?: string
): Promise<{ data: AttendanceRecord | null; error: Error | null }> {
  const record: Omit<AttendanceRecord, 'id' | 'created_at'> & { location_id?: string } = {
    user_id: userId,
    timestamp: new Date().toISOString(),
    status,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
  };

  if (locationId) {
    record.location_id = locationId;
  }

  try {
    const response = await fetchFromSupabase('attendance', {
      method: 'POST',
      body: JSON.stringify(record),
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: new Error(data.message || 'Failed to record attendance') };
    }

    return { data: Array.isArray(data) ? data[0] : data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error('Failed to record attendance') };
  }
}

export async function getLastAttendanceStatus(
  userId: string
): Promise<{ status: AttendanceStatus | null; error: Error | null }> {
  try {
    const response = await fetchFromSupabase(
      `attendance?user_id=eq.${userId}&select=status&order=timestamp.desc&limit=1`
    );

    const data = await response.json();

    if (!response.ok) {
      return { status: null, error: new Error(data.message || 'Failed to get status') };
    }

    if (Array.isArray(data) && data.length > 0) {
      return { status: data[0].status, error: null };
    }

    return { status: null, error: null };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err : new Error('Failed to get status') };
  }
}

export async function getTodayAttendance(
  userId: string
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const response = await fetchFromSupabase(
      `attendance?user_id=eq.${userId}&timestamp=gte.${today.toISOString()}&select=*&order=timestamp.asc`
    );

    const data = await response.json();

    if (!response.ok) {
      return { records: [], error: new Error(data.message || 'Failed to get attendance') };
    }

    return { records: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err : new Error('Failed to get attendance') };
  }
}

export async function getAttendanceByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  try {
    const response = await fetchFromSupabase(
      `attendance?user_id=eq.${userId}&timestamp=gte.${start.toISOString()}&timestamp=lte.${end.toISOString()}&select=*&order=timestamp.asc`
    );

    const data = await response.json();

    if (!response.ok) {
      return { records: [], error: new Error(data.message || 'Failed to get attendance') };
    }

    return { records: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err : new Error('Failed to get attendance') };
  }
}
