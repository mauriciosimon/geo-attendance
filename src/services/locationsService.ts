import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { Coordinates, Location } from '../types';

const TABLE_NAME = 'locations';
const LOCAL_STORAGE_KEY = '@geofence_locations';

// Local storage functions
async function getLocalLocations(): Promise<Location[]> {
  try {
    const data = await AsyncStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function saveLocalLocations(locations: Location[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(locations));
}

export async function createLocation(
  name: string,
  coordinates: Coordinates,
  radiusMeters: number,
  createdBy: string
): Promise<{ data: Location | null; error: Error | null }> {
  const record: Location = {
    id: `local-${Date.now()}`,
    name,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    radius_meters: radiusMeters,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured) {
    try {
      const locations = await getLocalLocations();
      locations.unshift(record);
      await saveLocalLocations(locations);
      return { data: record, error: null };
    } catch (err) {
      return { data: null, error: new Error('Failed to save locally') };
    }
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      name,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      radius_meters: radiusMeters,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

export async function getLocations(): Promise<{ locations: Location[]; error: Error | null }> {
  if (!isSupabaseConfigured) {
    try {
      const locations = await getLocalLocations();
      return { locations, error: null };
    } catch (err) {
      return { locations: [], error: new Error('Failed to load locally') };
    }
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return { locations: [], error: new Error(error.message) };
  }

  return { locations: data || [], error: null };
}

export async function deleteLocationById(
  locationId: string
): Promise<{ error: Error | null }> {
  if (!isSupabaseConfigured) {
    try {
      const locations = await getLocalLocations();
      const filtered = locations.filter((loc) => loc.id !== locationId);
      await saveLocalLocations(filtered);
      return { error: null };
    } catch (err) {
      return { error: new Error('Failed to delete locally') };
    }
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', locationId);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
