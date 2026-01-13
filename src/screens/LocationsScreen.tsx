import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import * as ExpoLocation from 'expo-location';
import { createLocation, getLocations, deleteLocationById, updateLocation } from '../services/locationsService';
import { Location, Coordinates } from '../types';
import { formatDistance } from '../utils/geofencing';

const TEMP_USER_ID = 'user-123';

const RADIUS_OPTIONS = [
  { label: '100m', value: 100 },
  { label: '200m', value: 200 },
  { label: '500m', value: 500 },
  { label: '1km', value: 1000 },
];

export default function LocationsScreen() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [selectedRadius, setSelectedRadius] = useState<number | null>(100);
  const [customRadiusKm, setCustomRadiusKm] = useState('');
  const [useCustomRadius, setUseCustomRadius] = useState(false);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Edit mode state
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const { locations: data, error: err } = await getLocations();
      if (err) {
        setError(err.message);
      } else {
        setLocations(data);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load locations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLocations();
  };

  const handleDelete = (item: Location) => {
    Alert.alert(
      'Delete Location',
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!item.id) return;
            const { error: err } = await deleteLocationById(item.id);
            if (err) {
              Alert.alert('Error', err.message);
            } else {
              setLocations((prev) => prev.filter((loc) => loc.id !== item.id));
            }
          },
        },
      ]
    );
  };

  const handleUseCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission denied');
        return;
      }

      const location = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.High,
      });

      setCoordinates({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const getEffectiveRadius = (): number | null => {
    if (useCustomRadius) {
      const km = parseFloat(customRadiusKm);
      if (isNaN(km) || km <= 0) return null;
      return Math.round(km * 1000); // Convert km to meters
    }
    return selectedRadius;
  };

  const handleSaveLocation = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a location name');
      return;
    }

    if (!coordinates) {
      Alert.alert('Error', 'Please set coordinates using "Use Current Location"');
      return;
    }

    const radius = getEffectiveRadius();
    if (!radius) {
      Alert.alert('Error', 'Please enter a valid radius');
      return;
    }

    setIsSaving(true);
    try {
      if (editingLocation) {
        // Update existing location
        const { data, error: err } = await updateLocation(editingLocation.id!, {
          name: name.trim(),
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radius_meters: radius,
        });

        if (err) {
          Alert.alert('Error', err.message);
          return;
        }

        if (data) {
          setLocations((prev) =>
            prev.map((loc) => (loc.id === editingLocation.id ? data : loc))
          );
        }

        Alert.alert('Success', 'Location updated!');
      } else {
        // Create new location
        const { data, error: err } = await createLocation(
          name.trim(),
          coordinates,
          radius,
          TEMP_USER_ID
        );

        if (err) {
          Alert.alert('Error', err.message);
          return;
        }

        if (data) {
          setLocations((prev) => [data, ...prev]);
        }

        Alert.alert('Success', 'Location saved!');
      }

      // Reset form
      setName('');
      setCoordinates(null);
      setSelectedRadius(100);
      setCustomRadiusKm('');
      setUseCustomRadius(false);
      setEditingLocation(null);
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to save location');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddModal = () => {
    setName('');
    setCoordinates(null);
    setSelectedRadius(100);
    setCustomRadiusKm('');
    setUseCustomRadius(false);
    setEditingLocation(null);
    setModalVisible(true);
  };

  const openEditModal = (location: Location) => {
    setEditingLocation(location);
    setName(location.name);
    setCoordinates({
      latitude: location.latitude,
      longitude: location.longitude,
    });
    // Set radius - check if it matches a preset or use custom
    const preset = RADIUS_OPTIONS.find((opt) => opt.value === location.radius_meters);
    if (preset) {
      setSelectedRadius(preset.value);
      setUseCustomRadius(false);
      setCustomRadiusKm('');
    } else {
      setSelectedRadius(null);
      setUseCustomRadius(true);
      setCustomRadiusKm((location.radius_meters / 1000).toString());
    }
    setModalVisible(true);
  };

  const renderItem = ({ item }: { item: Location }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.locationName}>{item.name}</Text>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(item)}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Radius:</Text>
        <Text style={styles.infoValue}>{formatDistance(item.radius_meters)}</Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Coordinates:</Text>
        <Text style={styles.coordsValue}>
          {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
        </Text>
      </View>
    </View>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No locations yet</Text>
      <Text style={styles.emptySubtext}>
        Tap "Add Location" to create your first geofence
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Locations</Text>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ Add Location</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={locations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id || Math.random().toString()}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={renderEmptyList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      />

      {/* Add/Edit Location Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingLocation ? 'Edit Location' : 'Add New Location'}
            </Text>

            <Text style={styles.inputLabel}>Location Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Sharjah Office"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.inputLabel}>Radius</Text>
            <View style={styles.radiusContainer}>
              {RADIUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.radiusOption,
                    !useCustomRadius && selectedRadius === option.value && styles.radiusOptionSelected,
                  ]}
                  onPress={() => {
                    setSelectedRadius(option.value);
                    setUseCustomRadius(false);
                    setCustomRadiusKm('');
                  }}
                >
                  <Text
                    style={[
                      styles.radiusOptionText,
                      !useCustomRadius && selectedRadius === option.value && styles.radiusOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Or enter custom radius (km)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., 2.5"
              value={customRadiusKm}
              onChangeText={(text) => {
                setCustomRadiusKm(text);
                if (text) {
                  setUseCustomRadius(true);
                  setSelectedRadius(null);
                } else {
                  setUseCustomRadius(false);
                  setSelectedRadius(100);
                }
              }}
              keyboardType="decimal-pad"
            />
            {useCustomRadius && customRadiusKm && (
              <Text style={styles.customRadiusDisplay}>
                = {(parseFloat(customRadiusKm) * 1000).toFixed(0)}m
              </Text>
            )}

            <Text style={styles.inputLabel}>Coordinates</Text>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={handleUseCurrentLocation}
              disabled={isGettingLocation}
            >
              {isGettingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.locationButtonText}>Use Current Location</Text>
              )}
            </TouchableOpacity>

            {coordinates && (
              <Text style={styles.coordsDisplay}>
                {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
              </Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, (!name || !coordinates || !getEffectiveRadius()) && styles.saveButtonDisabled]}
                onPress={handleSaveLocation}
                disabled={!name || !coordinates || !getEffectiveRadius() || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: '#1976d2',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: '#f44336',
    fontWeight: '600',
    fontSize: 12,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    width: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  coordsValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  errorText: {
    color: '#f44336',
    textAlign: 'center',
    padding: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  radiusContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  radiusOption: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  radiusOptionSelected: {
    backgroundColor: '#007AFF',
  },
  radiusOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  radiusOptionTextSelected: {
    color: '#fff',
  },
  locationButton: {
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  coordsDisplay: {
    textAlign: 'center',
    fontFamily: 'monospace',
    color: '#666',
    marginBottom: 16,
  },
  customRadiusDisplay: {
    textAlign: 'center',
    color: '#007AFF',
    fontSize: 14,
    marginTop: -8,
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 16,
  },
  saveButton: {
    flex: 1,
    padding: 14,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
