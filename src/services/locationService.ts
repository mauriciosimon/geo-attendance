import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { Coordinates, SavedLocation } from '../types';

const TABLE_NAME = 'saved_locations';
const LOCAL_STORAGE_KEY = '@saved_locations';

// Local storage functions
async function getLocalLocations(): Promise<SavedLocation[]> {
  try {
    const data = await AsyncStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function saveLocalLocations(locations: SavedLocation[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(locations));
}

export async function saveLocation(
  userId: string,
  coordinates: Coordinates,
  label?: string
): Promise<{ data: SavedLocation | null; error: Error | null }> {
  const record: SavedLocation = {
    id: `local-${Date.now()}`,
    user_id: userId,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    label,
    created_at: new Date().toISOString(),
  };

  // Use local storage if Supabase is not configured
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

  // Use Supabase
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      label,
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data, error: null };
}

export async function getSavedLocations(
  userId: string
): Promise<{ locations: SavedLocation[]; error: Error | null }> {
  // Use local storage if Supabase is not configured
  if (!isSupabaseConfigured) {
    try {
      const locations = await getLocalLocations();
      const userLocations = locations.filter((loc) => loc.user_id === userId);
      return { locations: userLocations, error: null };
    } catch (err) {
      return { locations: [], error: new Error('Failed to load locally') };
    }
  }

  // Use Supabase
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return { locations: [], error: new Error(error.message) };
  }

  return { locations: data || [], error: null };
}

export async function deleteLocation(
  locationId: string
): Promise<{ error: Error | null }> {
  // Use local storage if Supabase is not configured
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

  // Use Supabase
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', locationId);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
