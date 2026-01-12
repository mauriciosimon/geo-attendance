import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { calculateDistance, formatDistance } from '../utils/geofencing';
import { recordAttendance, getLastAttendanceStatus } from '../services/attendanceService';
import { getLocations } from '../services/locationsService';
import { Coordinates, AttendanceStatus, Location as LocationType, NearbyLocation } from '../types';

const TEMP_USER_ID = 'user-123';

export default function AttendanceScreen() {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<AttendanceStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allLocations, setAllLocations] = useState<LocationType[]>([]);
  const [nearbyLocations, setNearbyLocations] = useState<NearbyLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<NearbyLocation | null>(null);

  const fetchLocations = useCallback(async () => {
    const { locations } = await getLocations();
    setAllLocations(locations);
  }, []);

  // Refresh locations when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchLocations();
    }, [fetchLocations])
  );

  const calculateNearbyLocations = useCallback(
    (userCoords: Coordinates) => {
      const nearby: NearbyLocation[] = allLocations.map((loc) => {
        const distance = calculateDistance(userCoords, {
          latitude: loc.latitude,
          longitude: loc.longitude,
        });
        return {
          ...loc,
          distance,
          isInside: distance <= loc.radius_meters,
        };
      });

      // Sort by distance
      nearby.sort((a, b) => a.distance - b.distance);
      setNearbyLocations(nearby);

      // Auto-select the closest location user is inside
      const insideLocation = nearby.find((loc) => loc.isInside);
      setSelectedLocation(insideLocation || null);
    },
    [allLocations]
  );

  const fetchLocation = useCallback(async () => {
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

      const coords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      setCoordinates(coords);
      calculateNearbyLocations(coords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
    } finally {
      setLoading(false);
    }
  }, [calculateNearbyLocations]);

  const fetchLastStatus = useCallback(async () => {
    const { status } = await getLastAttendanceStatus(TEMP_USER_ID);
    setLastStatus(status);
  }, []);

  useEffect(() => {
    fetchLocations();
    fetchLastStatus();
  }, [fetchLocations, fetchLastStatus]);

  useEffect(() => {
    if (allLocations.length >= 0) {
      fetchLocation();
    }
  }, [allLocations, fetchLocation]);

  const handleCheckInOut = async () => {
    if (!coordinates || !selectedLocation) {
      Alert.alert('Error', 'You must be inside a location to check in/out');
      return;
    }

    const newStatus: AttendanceStatus =
      lastStatus === 'check_in' ? 'check_out' : 'check_in';

    setIsSubmitting(true);

    try {
      const { error: err } = await recordAttendance(
        TEMP_USER_ID,
        newStatus,
        coordinates
      );

      if (err) {
        Alert.alert('Error', err.message);
        return;
      }

      setLastStatus(newStatus);
      Alert.alert(
        'Success',
        `${newStatus === 'check_in' ? 'Checked in' : 'Checked out'} at ${selectedLocation.name}!`
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to record attendance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getButtonText = (): string => {
    if (!selectedLocation) return 'Not Inside Any Location';
    if (lastStatus === 'check_in') return 'Check Out';
    return 'Check In';
  };

  const insideLocations = nearbyLocations.filter((loc) => loc.isInside);
  const outsideLocations = nearbyLocations.filter((loc) => !loc.isInside);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Check In</Text>
      <Text style={styles.subtitle}>
        {allLocations.length === 0
          ? 'No locations configured'
          : `${allLocations.length} location(s) available`}
      </Text>

      {/* Current Location Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Location</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : coordinates ? (
          <>
            <Text style={styles.coordsText}>
              {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
            </Text>
          </>
        ) : null}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={fetchLocation}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>Refresh Location</Text>
        </TouchableOpacity>
      </View>

      {/* Nearby Locations Card */}
      {allLocations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nearby Locations</Text>

          {insideLocations.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>You are inside:</Text>
              {insideLocations.map((loc) => (
                <TouchableOpacity
                  key={loc.id}
                  style={[
                    styles.locationItem,
                    styles.locationInside,
                    selectedLocation?.id === loc.id && styles.locationSelected,
                  ]}
                  onPress={() => setSelectedLocation(loc)}
                >
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{loc.name}</Text>
                    <Text style={styles.locationDistance}>
                      {formatDistance(loc.distance)} from center
                    </Text>
                  </View>
                  <View style={styles.insideBadge}>
                    <Text style={styles.insideBadgeText}>Inside</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          {outsideLocations.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>
                {insideLocations.length > 0 ? 'Other locations:' : 'Locations:'}
              </Text>
              {outsideLocations.slice(0, 5).map((loc) => (
                <View key={loc.id} style={styles.locationItem}>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationNameOutside}>{loc.name}</Text>
                    <Text style={styles.locationDistance}>
                      {formatDistance(loc.distance - loc.radius_meters)} away
                    </Text>
                  </View>
                  <View style={styles.outsideBadge}>
                    <Text style={styles.outsideBadgeText}>Outside</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {nearbyLocations.length === 0 && !loading && (
            <Text style={styles.noLocationsText}>
              No locations found. Add locations in the Locations tab.
            </Text>
          )}
        </View>
      )}

      {/* Check In/Out Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance</Text>

        <Text style={styles.currentStatus}>
          Status:{' '}
          <Text style={styles.statusBold}>
            {lastStatus === 'check_in'
              ? 'Checked In'
              : lastStatus === 'check_out'
                ? 'Checked Out'
                : 'Not checked in'}
          </Text>
        </Text>

        {selectedLocation && (
          <Text style={styles.selectedLocationText}>
            Location: <Text style={styles.statusBold}>{selectedLocation.name}</Text>
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.actionButton,
            !selectedLocation && styles.actionButtonDisabled,
          ]}
          onPress={handleCheckInOut}
          disabled={!selectedLocation || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>{getButtonText()}</Text>
          )}
        </TouchableOpacity>

        {!selectedLocation && insideLocations.length === 0 && allLocations.length > 0 && (
          <Text style={styles.warningText}>
            Move inside a location to check in/out
          </Text>
        )}

        {allLocations.length === 0 && (
          <Text style={styles.warningText}>
            Add locations in the Locations tab to enable check-in
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  coordsText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
  },
  refreshButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  locationInside: {
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#c8e6c9',
  },
  locationSelected: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2e7d32',
  },
  locationNameOutside: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  locationDistance: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  insideBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  insideBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  outsideBadge: {
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  outsideBadgeText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  noLocationsText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
  currentStatus: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  selectedLocationText: {
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
    color: '#666',
  },
  statusBold: {
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    backgroundColor: '#ccc',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningText: {
    marginTop: 12,
    textAlign: 'center',
    color: '#f44336',
    fontSize: 14,
  },
  errorText: {
    color: '#f44336',
    textAlign: 'center',
    marginBottom: 12,
  },
});
