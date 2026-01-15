import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as LocalAuthentication from 'expo-local-authentication';
import { useFocusEffect } from '@react-navigation/native';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};
import { calculateDistance, formatDistance } from '../utils/geofencing';
import { recordAttendance, getLastAttendanceStatus, getTodayAttendance } from '../services/attendanceService';
import { getLocations } from '../services/locationsService';
import { useAuth } from '../context/AuthContext';
import { Coordinates, AttendanceStatus, Location as LocationType, NearbyLocation, AttendanceRecord } from '../types';

interface AttendanceHistoryItem extends AttendanceRecord {
  locationName?: string;
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const userId = user?.id || '';

  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<AttendanceStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allLocations, setAllLocations] = useState<LocationType[]>([]);
  const [nearbyLocations, setNearbyLocations] = useState<NearbyLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<NearbyLocation | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([]);

  const fetchLocations = useCallback(async () => {
    const { locations } = await getLocations();
    setAllLocations(locations);
    return locations;
  }, []);

  const findLocationName = (lat: number, lng: number, locations: LocationType[]): string => {
    for (const loc of locations) {
      const distance = calculateDistance(
        { latitude: lat, longitude: lng },
        { latitude: loc.latitude, longitude: loc.longitude }
      );
      if (distance <= loc.radius_meters) {
        return loc.name;
      }
    }
    return 'Unknown';
  };

  const fetchAttendanceHistory = useCallback(async (locations: LocationType[]) => {
    console.log('Fetching attendance history for userId:', userId);
    const { records, error } = await getTodayAttendance(userId);
    console.log('Attendance history result:', { records, error });
    const historyWithLocations: AttendanceHistoryItem[] = records.map((record) => ({
      ...record,
      locationName: findLocationName(record.latitude, record.longitude, locations),
    }));
    setAttendanceHistory(historyWithLocations.reverse()); // Most recent first
  }, [userId]);

  // Refresh locations and history when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        const locations = await fetchLocations();
        fetchAttendanceHistory(locations);
      };
      loadData();
    }, [fetchLocations, fetchAttendanceHistory])
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
        maximumAge: 0, // Force fresh location, no cache
        timeout: 15000, // 15 second timeout
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
    console.log('Fetching last status for userId:', userId);
    const { status, error } = await getLastAttendanceStatus(userId);
    console.log('Last status result:', { status, error });
    setLastStatus(status);
  }, [userId]);

  useEffect(() => {
    const loadInitialData = async () => {
      const locations = await fetchLocations();
      fetchLastStatus();
      fetchAttendanceHistory(locations);
    };
    loadInitialData();
  }, [fetchLocations, fetchLastStatus, fetchAttendanceHistory]);

  useEffect(() => {
    if (allLocations.length >= 0) {
      fetchLocation();
    }
  }, [allLocations, fetchLocation]);

  const authenticateWithBiometrics = async (): Promise<boolean> => {
    // On web, skip biometric and just confirm
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Confirm your identity to proceed with check-in/out');
      return confirmed;
    }

    try {
      // Check if hardware is available
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        showAlert('Not Available', 'Biometric authentication is not available on this device');
        return false;
      }

      // Check if biometrics are enrolled
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        showAlert('Not Set Up', 'Please set up Face ID, fingerprint, or device PIN in your device settings');
        return false;
      }

      // Get supported authentication types
      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const hasFaceId = supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
      const hasFingerprint = supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

      let promptMessage = 'Verify your identity to check in/out';
      if (hasFaceId) {
        promptMessage = 'Use Face ID to verify your identity';
      } else if (hasFingerprint) {
        promptMessage = 'Use fingerprint to verify your identity';
      }

      // Authenticate
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: false,
      });

      if (result.success) {
        return true;
      } else {
        if (result.error === 'user_cancel') {
          showAlert('Cancelled', 'Authentication was cancelled');
        } else {
          showAlert('Failed', 'Authentication failed. Please try again.');
        }
        return false;
      }
    } catch (err) {
      console.error('Biometric auth error:', err);
      showAlert('Error', 'Failed to authenticate');
      return false;
    }
  };

  const handleCheckInOut = async () => {
    if (!coordinates || !selectedLocation) {
      showAlert('Error', 'You must be inside a location to check in/out');
      return;
    }

    // Require biometric authentication first
    const authenticated = await authenticateWithBiometrics();
    if (!authenticated) {
      return;
    }

    const newStatus: AttendanceStatus =
      lastStatus === 'check_in' ? 'check_out' : 'check_in';

    setIsSubmitting(true);

    try {
      console.log('Recording attendance:', { userId, newStatus, coordinates, locationId: selectedLocation.id });

      const { data, error: err } = await recordAttendance(
        userId,
        newStatus,
        coordinates,
        selectedLocation.id
      );

      console.log('Record result:', { data, error: err });

      if (err) {
        showAlert('Error', err.message);
        return;
      }

      setLastStatus(newStatus);
      await fetchAttendanceHistory(allLocations); // Refresh history
      showAlert(
        'Success',
        `${newStatus === 'check_in' ? 'Checked in' : 'Checked out'} at ${selectedLocation.name}!`
      );
    } catch (err) {
      showAlert('Error', 'Failed to record attendance');
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

      {/* Today's History Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's History</Text>

        {attendanceHistory.length === 0 ? (
          <Text style={styles.noHistoryText}>No check-ins/outs today</Text>
        ) : (
          <View style={styles.historyTable}>
            <View style={styles.historyHeader}>
              <Text style={[styles.historyHeaderCell, styles.historyStatus]}>Status</Text>
              <Text style={[styles.historyHeaderCell, styles.historyLocation]}>Location</Text>
              <Text style={[styles.historyHeaderCell, styles.historyTime]}>Time</Text>
            </View>
            {attendanceHistory.map((item, index) => (
              <View
                key={item.id || index}
                style={[
                  styles.historyRow,
                  index % 2 === 0 ? styles.historyRowEven : styles.historyRowOdd,
                ]}
              >
                <View style={[styles.historyCell, styles.historyStatus]}>
                  <View
                    style={[
                      styles.statusDot,
                      item.status === 'check_in' ? styles.statusDotIn : styles.statusDotOut,
                    ]}
                  />
                  <Text style={styles.historyCellText}>
                    {item.status === 'check_in' ? 'In' : 'Out'}
                  </Text>
                </View>
                <Text style={[styles.historyCell, styles.historyLocation, styles.historyCellText]} numberOfLines={1}>
                  {item.locationName}
                </Text>
                <Text style={[styles.historyCell, styles.historyTime, styles.historyCellText]}>
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
          </View>
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
    paddingTop: 80,
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
  noHistoryText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
  },
  historyTable: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  historyHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  historyHeaderCell: {
    fontWeight: '600',
    fontSize: 13,
    color: '#333',
  },
  historyRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  historyRowEven: {
    backgroundColor: '#fff',
  },
  historyRowOdd: {
    backgroundColor: '#fafafa',
  },
  historyCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyCellText: {
    fontSize: 13,
    color: '#333',
  },
  historyStatus: {
    width: 60,
  },
  historyLocation: {
    flex: 1,
    paddingHorizontal: 8,
  },
  historyTime: {
    width: 60,
    textAlign: 'right',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotIn: {
    backgroundColor: '#4CAF50',
  },
  statusDotOut: {
    backgroundColor: '#f44336',
  },
});
