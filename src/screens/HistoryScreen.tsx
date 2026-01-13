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
} from 'react-native';
import { getSavedLocations, deleteLocation } from '../services/locationService';
import { useAuth } from '../context/AuthContext';
import { SavedLocation } from '../types';

export default function HistoryScreen() {
  const { user } = useAuth();
  const userId = user?.id || '';

  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const { locations: data, error: err } = await getSavedLocations(userId);
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

  const handleDelete = (item: SavedLocation) => {
    Alert.alert(
      'Delete Location',
      'Are you sure you want to delete this saved location?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!item.id) return;
            const { error: err } = await deleteLocation(item.id);
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

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const renderItem = ({ item }: { item: SavedLocation }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.label}>{item.label || 'Saved Location'}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.coordsContainer}>
        <Text style={styles.coordsLabel}>Latitude:</Text>
        <Text style={styles.coordsValue}>{item.latitude.toFixed(6)}</Text>
      </View>

      <View style={styles.coordsContainer}>
        <Text style={styles.coordsLabel}>Longitude:</Text>
        <Text style={styles.coordsValue}>{item.longitude.toFixed(6)}</Text>
      </View>

      <Text style={styles.timestamp}>{formatDate(item.created_at)}</Text>
    </View>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>No saved locations yet</Text>
      <Text style={styles.emptySubtext}>
        Go back and tap "Save Current Location" to add locations
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

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchLocations}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Saved Locations</Text>
      <Text style={styles.subtitle}>{locations.length} location(s) saved</Text>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 80,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
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
    marginBottom: 16,
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
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
  coordsContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  coordsLabel: {
    fontSize: 14,
    color: '#666',
    width: 80,
  },
  coordsValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
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
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
