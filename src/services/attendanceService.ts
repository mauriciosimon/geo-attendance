import { api } from '../config/api';
import { AttendanceRecord, AttendanceStatus, Coordinates } from '../types';

export async function recordAttendance(
  _userId: string, // kept for API compatibility, server uses JWT user
  status: AttendanceStatus,
  coordinates: Coordinates,
  locationId?: string
): Promise<{ data: AttendanceRecord | null; error: Error | null }> {
  try {
    const record = await api.post<AttendanceRecord>('/api/attendance', {
      status,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      location_id: locationId,
    });
    return { data: record, error: null };
  } catch (error: any) {
    return { data: null, error: new Error(error.message) };
  }
}

export async function getLastAttendanceStatus(
  _userId: string // kept for API compatibility, server uses JWT user
): Promise<{ status: AttendanceStatus | null; error: Error | null }> {
  try {
    const record = await api.get<AttendanceRecord | null>('/api/attendance/last');
    return { status: record?.status || null, error: null };
  } catch (error: any) {
    return { status: null, error: new Error(error.message) };
  }
}

export async function getTodayAttendance(
  _userId: string // kept for API compatibility, server uses JWT user
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const params = new URLSearchParams();
    params.append('start', today.toISOString());

    const records = await api.get<AttendanceRecord[]>(`/api/attendance/me?${params.toString()}`);
    return { records, error: null };
  } catch (error: any) {
    return { records: [], error: new Error(error.message) };
  }
}

export async function getAttendanceByDateRange(
  _userId: string, // kept for API compatibility, server uses JWT user
  startDate: Date,
  endDate: Date
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  try {
    const params = new URLSearchParams();
    params.append('start', start.toISOString());
    params.append('end', end.toISOString());

    const records = await api.get<AttendanceRecord[]>(`/api/attendance/me?${params.toString()}`);
    return { records, error: null };
  } catch (error: any) {
    return { records: [], error: new Error(error.message) };
  }
}

// Admin functions
export async function getAttendanceForUser(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<{ records: AttendanceRecord[]; error: Error | null }> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  try {
    const params = new URLSearchParams();
    params.append('start', start.toISOString());
    params.append('end', end.toISOString());

    const records = await api.get<AttendanceRecord[]>(
      `/api/attendance/user/${userId}?${params.toString()}`
    );
    return { records, error: null };
  } catch (error: any) {
    return { records: [], error: new Error(error.message) };
  }
}

export async function getAllAttendance(
  startDate: Date,
  endDate: Date,
  locationId?: string,
  userId?: string
): Promise<{ records: any[]; error: Error | null }> {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  try {
    const params = new URLSearchParams();
    params.append('start', start.toISOString());
    params.append('end', end.toISOString());
    if (locationId) params.append('location_id', locationId);
    if (userId) params.append('user_id', userId);

    const records = await api.get<any[]>(`/api/attendance/all?${params.toString()}`);
    return { records, error: null };
  } catch (error: any) {
    return { records: [], error: new Error(error.message) };
  }
}
