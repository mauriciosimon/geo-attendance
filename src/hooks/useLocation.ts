import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import { Coordinates } from '../types';
import { getGeofenceStatus } from '../utils/geofencing';
import { ACTIVE_GEOFENCE } from '../config/constants';

interface UseLocationResult {
  coordinates: Coordinates | null;
  isWithinFence: boolean;
  distance: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useLocation(): UseLocationResult {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setCoordinates({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const geofenceStatus = coordinates
    ? getGeofenceStatus(coordinates, ACTIVE_GEOFENCE)
    : null;

  return {
    coordinates,
    isWithinFence: geofenceStatus?.isInside ?? false,
    distance: geofenceStatus?.distance ?? null,
    loading,
    error,
    refresh,
  };
}
