import { supabase } from '../config/supabase';
import { AttendanceRecord, AttendanceStatus, Coordinates } from '../types';

const TABLE_NAME = 'attendance';

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

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(record)
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

export async function getLastAttendanceStatus(
  userId: string
): Promise<{ status: AttendanceStatus | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('status')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      return { status: null, error: null };
    }
    return { status: null, error: new Error(error.message) };
  }

  return { status: data?.status || null, error: null };
}

export async function getTodayAttendance(
  userId: string
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', today.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    return { records: [], error: new Error(error.message) };
  }

  return { records: data || [], error: null };
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

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start.toISOString())
    .lte('timestamp', end.toISOString())
    .order('timestamp', { ascending: true });

  if (error) {
    return { records: [], error: new Error(error.message) };
  }

  return { records: data || [], error: null };
}
