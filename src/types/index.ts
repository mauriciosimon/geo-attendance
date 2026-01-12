export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoFence {
  center: Coordinates;
  radiusMeters: number;
  name: string;
}

export type AttendanceStatus = 'check_in' | 'check_out';

export interface AttendanceRecord {
  id?: string;
  user_id: string;
  timestamp: string;
  status: AttendanceStatus;
  latitude: number;
  longitude: number;
  created_at?: string;
}

export interface LocationState {
  coordinates: Coordinates | null;
  isWithinFence: boolean;
  distanceFromCenter: number | null;
  error: string | null;
  loading: boolean;
}

export interface SavedLocation {
  id?: string;
  user_id: string;
  latitude: number;
  longitude: number;
  label?: string;
  created_at?: string;
}
