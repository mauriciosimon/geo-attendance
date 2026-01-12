import { Coordinates, GeoFence } from '../types';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Converts degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculates the distance between two coordinates using the Haversine formula
 * @returns Distance in meters
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLon = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Checks if a point is within a geofence
 */
export function isWithinGeofence(
  userLocation: Coordinates,
  geofence: GeoFence
): boolean {
  const distance = calculateDistance(userLocation, geofence.center);
  return distance <= geofence.radiusMeters;
}

/**
 * Gets the distance from a point to the geofence center
 * @returns Distance in meters
 */
export function getDistanceFromGeofence(
  userLocation: Coordinates,
  geofence: GeoFence
): number {
  return calculateDistance(userLocation, geofence.center);
}

/**
 * Formats distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

/**
 * Returns detailed geofence status
 */
export function getGeofenceStatus(
  userLocation: Coordinates,
  geofence: GeoFence
): {
  isInside: boolean;
  distance: number;
  formattedDistance: string;
  message: string;
} {
  const distance = calculateDistance(userLocation, geofence.center);
  const isInside = distance <= geofence.radiusMeters;

  return {
    isInside,
    distance,
    formattedDistance: formatDistance(distance),
    message: isInside
      ? `You are inside ${geofence.name}`
      : `You are ${formatDistance(distance - geofence.radiusMeters)} outside ${geofence.name}`,
  };
}
