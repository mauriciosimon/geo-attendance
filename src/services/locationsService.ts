import { api } from '../config/api';
import { Coordinates, Location } from '../types';

export async function createLocation(
  name: string,
  coordinates: Coordinates,
  radiusMeters: number,
  _createdBy: string // kept for API compatibility, server uses JWT user
): Promise<{ data: Location | null; error: Error | null }> {
  try {
    const location = await api.post<Location>('/api/locations', {
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radius_meters: radiusMeters,
    });
    return { data: location, error: null };
  } catch (error: any) {
    return { data: null, error: new Error(error.message) };
  }
}

export async function getLocations(): Promise<{ locations: Location[]; error: Error | null }> {
  try {
    const locations = await api.get<Location[]>('/api/locations');
    return { locations, error: null };
  } catch (error: any) {
    return { locations: [], error: new Error(error.message) };
  }
}

export async function updateLocation(
  locationId: string,
  updates: {
    name?: string;
    latitude?: number;
    longitude?: number;
    radius_meters?: number;
  }
): Promise<{ data: Location | null; error: Error | null }> {
  try {
    const location = await api.put<Location>(`/api/locations/${locationId}`, updates);
    return { data: location, error: null };
  } catch (error: any) {
    return { data: null, error: new Error(error.message) };
  }
}

export async function deleteLocationById(locationId: string): Promise<{ error: Error | null }> {
  try {
    await api.delete(`/api/locations/${locationId}`);
    return { error: null };
  } catch (error: any) {
    return { error: new Error(error.message) };
  }
}
