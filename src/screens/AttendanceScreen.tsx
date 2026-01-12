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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ACTIVE_GEOFENCE } from '../config/constants';
import {
  isWithinGeofence,
  getGeofenceStatus,
  formatDistance,
} from '../utils/geofencing';
import { recordAttendance, getLastAttendanceStatus } from '../services/attendanceService';
import { saveLocation } from '../services/locationService';
import { Coordinates, AttendanceStatus, LocationState, GeoFence } from '../types';

type RootStackParamList = {
  Attendance: undefined;
  History: undefined;
};

type AttendanceScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Attendance'>;
};

const TEMP_USER_ID = 'user-123';

export default function AttendanceScreen({ navigation }: AttendanceScreenProps) {
  const [locationState, setLocationState] = useState<LocationState>({
    coordinates: null,
    isWithinFence: false,
    distanceFromCenter: null,
    error: null,
    loading: true,
  });
  const [lastStatus, setLastStatus] = useState<AttendanceStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingLocation, setIsSavingLocation] = useState(false);
  const [currentGeofence, setCurrentGeofence] = useState<GeoFence>(ACTIVE_GEOFENCE);

  const fetchLocation = useCallback(async () => {
    setLocationState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState((prev) => ({
          ...prev,
          loading: false,
          error: 'Location permission denied',
        }));
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const coords: Coordinates = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      const geofenceStatus = getGeofenceStatus(coords, currentGeofence);

      setLocationState({
        coordinates: coords,
        isWithinFence: geofenceStatus.isInside,
        distanceFromCenter: geofenceStatus.distance,
        error: null,
        loading: false,
      });
    } catch (error) {
      setLocationState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to get location',
      }));
    }
  }, [currentGeofence]);

  const fetchLastStatus = useCallback(async () => {
    const { status } = await getLastAttendanceStatus(TEMP_USER_ID);
    setLastStatus(status);
  }, []);

  useEffect(() => {
    fetchLocation();
    fetchLastStatus();
  }, [fetchLocation, fetchLastStatus]);

  const handleCheckInOut = async () => {
    if (!locationState.coordinates || !locationState.isWithinFence) {
      Alert.alert('Error', 'You must be within the geofence to check in/out');
      return;
    }

    const newStatus: AttendanceStatus =
      lastStatus === 'check_in' ? 'check_out' : 'check_in';

    setIsSubmitting(true);

    try {
      const { error } = await recordAttendance(
        TEMP_USER_ID,
        newStatus,
        locationState.coordinates
      );

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      setLastStatus(newStatus);
      Alert.alert(
        'Success',
        `${newStatus === 'check_in' ? 'Checked in' : 'Checked out'} successfully!`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to record attendance');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateGeofence = () => {
    if (!locationState.coordinates) {
      Alert.alert('Error', 'No location available');
      return;
    }

    const newGeofence: GeoFence = {
      ...currentGeofence,
      center: locationState.coordinates,
    };

    setCurrentGeofence(newGeofence);

    // Recalculate fence status with new center
    const geofenceStatus = getGeofenceStatus(locationState.coordinates, newGeofence);
    setLocationState((prev) => ({
      ...prev,
      isWithinFence: geofenceStatus.isInside,
      distanceFromCenter: geofenceStatus.distance,
    }));

    Alert.alert(
      'Geofence Updated',
      `New center: ${locationState.coordinates.latitude.toFixed(6)}, ${locationState.coordinates.longitude.toFixed(6)}`
    );
  };

  const handleSaveLocation = async () => {
    if (!locationState.coordinates) {
      Alert.alert('Error', 'No location available');
      return;
    }

    setIsSavingLocation(true);

    try {
      const { error } = await saveLocation(
        TEMP_USER_ID,
        locationState.coordinates,
        `Location saved at ${new Date().toLocaleTimeString()}`
      );

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      Alert.alert('Success', 'Location saved!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save location');
    } finally {
      setIsSavingLocation(false);
    }
  };

  const getButtonText = (): string => {
    if (!locationState.isWithinFence) return 'Outside Geofence';
    if (lastStatus === 'check_in') return 'Check Out';
    return 'Check In';
  };

  const getStatusColor = (): string => {
    if (locationState.isWithinFence) return '#4CAF50';
    return '#f44336';
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Attendance</Text>
      <Text style={styles.subtitle}>{currentGeofence.name}</Text>

      {/* Location Status Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location Status</Text>

        {locationState.loading ? (
          <ActivityIndicator size="large" color="#007AFF" />
        ) : locationState.error ? (
          <Text style={styles.errorText}>{locationState.error}</Text>
        ) : (
          <>
            <View
              style={[
                styles.statusIndicator,
                { backgroundColor: getStatusColor() },
              ]}
            >
              <Text style={styles.statusText}>
                {locationState.isWithinFence ? 'Inside' : 'Outside'}
              </Text>
            </View>

            {locationState.distanceFromCenter !== null && (
              <Text style={styles.distanceText}>
                {formatDistance(locationState.distanceFromCenter)} from center
              </Text>
            )}

            <Text style={styles.radiusText}>
              Allowed radius: {formatDistance(currentGeofence.radiusMeters)}
            </Text>

            {locationState.coordinates && (
              <Text style={styles.coordsText}>
                {locationState.coordinates.latitude.toFixed(6)},{' '}
                {locationState.coordinates.longitude.toFixed(6)}
              </Text>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={fetchLocation}
          disabled={locationState.loading}
        >
          <Text style={styles.refreshButtonText}>Refresh Location</Text>
        </TouchableOpacity>
      </View>

      {/* Geofence Settings Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Geofence Settings</Text>

        <Text style={styles.infoText}>
          Current Center: {currentGeofence.center.latitude.toFixed(6)}, {currentGeofence.center.longitude.toFixed(6)}
        </Text>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={handleUpdateGeofence}
          disabled={!locationState.coordinates || locationState.loading}
        >
          <Text style={styles.settingsButtonText}>Set Current Location as Center</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingsButton, styles.saveButton]}
          onPress={handleSaveLocation}
          disabled={!locationState.coordinates || isSavingLocation}
        >
          {isSavingLocation ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save Current Location</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('History')}
        >
          <Text style={styles.historyButtonText}>View Saved Locations</Text>
        </TouchableOpacity>
      </View>

      {/* Check In/Out Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance Action</Text>

        <Text style={styles.currentStatus}>
          Current Status:{' '}
          <Text style={styles.statusBold}>
            {lastStatus === 'check_in'
              ? 'Checked In'
              : lastStatus === 'check_out'
                ? 'Checked Out'
                : 'Not checked in'}
          </Text>
        </Text>

        <TouchableOpacity
          style={[
            styles.actionButton,
            !locationState.isWithinFence && styles.actionButtonDisabled,
          ]}
          onPress={handleCheckInOut}
          disabled={!locationState.isWithinFence || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>{getButtonText()}</Text>
          )}
        </TouchableOpacity>

        {!locationState.isWithinFence && !locationState.loading && (
          <Text style={styles.warningText}>
            Move within {formatDistance(currentGeofence.radiusMeters)} of the
            center to check in/out
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
  statusIndicator: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  distanceText: {
    textAlign: 'center',
    fontSize: 16,
    marginBottom: 4,
  },
  radiusText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  coordsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
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
  infoText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  settingsButton: {
    padding: 12,
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  settingsButtonText: {
    color: '#e65100',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  historyButton: {
    padding: 12,
    backgroundColor: '#e8eaf6',
    borderRadius: 8,
    alignItems: 'center',
  },
  historyButtonText: {
    color: '#3f51b5',
    fontWeight: '600',
  },
  currentStatus: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
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
