import { GeoFence } from '../types';

// Office location - replace with your actual office coordinates
export const OFFICE_GEOFENCE: GeoFence = {
  center: {
    latitude: 37.7749,  // Example: San Francisco
    longitude: -122.4194,
  },
  radiusMeters: 100, // 100 meter radius
  name: 'Main Office',
};

// For testing: use a larger radius or set to your current location
export const DEV_GEOFENCE: GeoFence = {
  center: {
    latitude: 37.7749,
    longitude: -122.4194,
  },
  radiusMeters: 5000, // 5km for easier testing
  name: 'Dev Test Zone',
};

// Use DEV_GEOFENCE for testing, OFFICE_GEOFENCE for production
export const ACTIVE_GEOFENCE = __DEV__ ? DEV_GEOFENCE : OFFICE_GEOFENCE;

// Location settings
export const LOCATION_CONFIG = {
  accuracy: 6, // Expo.Location.Accuracy.High
  distanceInterval: 10, // Minimum distance (meters) between location updates
  timeInterval: 5000, // Minimum time (ms) between location updates
};
