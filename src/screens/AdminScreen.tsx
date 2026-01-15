import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { api } from '../config/api';
import { Profile, AttendanceRecord, Location } from '../types';
import { getLocations } from '../services/locationsService';
import { getAttendanceForUser } from '../services/attendanceService';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const showConfirm = (title: string, message: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: onConfirm },
    ]);
  }
};

interface AttendanceWithLocation extends AttendanceRecord {
  location_name?: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function AdminScreen() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Employee detail modal
  const [selectedEmployee, setSelectedEmployee] = useState<Profile | null>(null);
  const [employeeAttendance, setEmployeeAttendance] = useState<AttendanceWithLocation[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedLocationFilter, setSelectedLocationFilter] = useState<string | null>(null);

  const fetchEmployees = useCallback(async () => {
    try {
      const data = await api.get<Profile[]>('/api/users');
      setEmployees(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchLocationsData = useCallback(async () => {
    const { locations: locs } = await getLocations();
    setLocations(locs);
  }, []);

  useEffect(() => {
    fetchEmployees();
    fetchLocationsData();
  }, [fetchEmployees, fetchLocationsData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEmployees();
  };

  const fetchEmployeeAttendance = async (employee: Profile) => {
    setSelectedEmployee(employee);
    setAttendanceLoading(true);

    try {
      const { records } = await getAttendanceForUser(employee.id, startDate, endDate);

      // Filter by location if selected and map location names
      let filteredRecords = records;
      if (selectedLocationFilter) {
        filteredRecords = records.filter((r: any) => r.location_id === selectedLocationFilter);
      }

      const attendanceWithLocations: AttendanceWithLocation[] = filteredRecords.map((record: any) => {
        const location = locations.find((l) => l.id === record.location_id);
        return {
          ...record,
          location_name: location?.name || record.location?.name || 'Unknown',
        };
      });

      setEmployeeAttendance(attendanceWithLocations);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const adjustDate = (which: 'start' | 'end', days: number) => {
    if (which === 'start') {
      const newDate = new Date(startDate);
      newDate.setDate(newDate.getDate() + days);
      if (newDate <= endDate) {
        setStartDate(newDate);
      }
    } else {
      const newDate = new Date(endDate);
      newDate.setDate(newDate.getDate() + days);
      if (newDate >= startDate && newDate <= new Date()) {
        setEndDate(newDate);
      }
    }
  };

  const applyFilters = () => {
    if (selectedEmployee) {
      fetchEmployeeAttendance(selectedEmployee);
    }
  };

  const resetDeviceForEmployee = async (employee: Profile) => {
    showConfirm(
      'Reset Device',
      `Are you sure you want to reset the device for ${employee.full_name}? They will be able to log in from a new device.`,
      async () => {
        try {
          await api.post(`/api/users/${employee.id}/reset-device`);
          showAlert('Success', `Device has been reset for ${employee.full_name}. They can now log in from a new device.`);
          fetchEmployees(); // Refresh the list
        } catch (err) {
          console.error('Error resetting device:', err);
          showAlert('Error', 'Failed to reset device');
        }
      }
    );
  };

  const renderEmployee = ({ item }: { item: Profile }) => (
    <View style={styles.employeeCard}>
      <TouchableOpacity
        style={styles.employeeMainArea}
        onPress={() => fetchEmployeeAttendance(item)}
      >
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{item.full_name}</Text>
          <Text style={styles.employeeEmail}>{item.email}</Text>
          {item.role !== 'admin' && (
            <View style={styles.deviceStatus}>
              <View style={[styles.deviceDot, item.device_id ? styles.deviceBound : styles.deviceUnbound]} />
              <Text style={styles.deviceText}>
                {item.device_id
                  ? `Device: ...${item.device_id.slice(-6)}`
                  : 'No device'}
              </Text>
            </View>
          )}
          {item.device_reset_requested && (
            <View style={styles.resetRequestBadge}>
              <Text style={styles.resetRequestText}>Reset Requested</Text>
            </View>
          )}
        </View>
        <View style={[styles.roleBadge, item.role === 'admin' && styles.adminBadge]}>
          <Text style={[styles.roleText, item.role === 'admin' && styles.adminRoleText]}>
            {item.role}
          </Text>
        </View>
      </TouchableOpacity>
      {item.role !== 'admin' && item.device_id && (
        <TouchableOpacity
          style={styles.resetDeviceButton}
          onPress={() => resetDeviceForEmployee(item)}
        >
          <Text style={styles.resetDeviceText}>Reset Device</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderAttendanceRecord = ({ item }: { item: AttendanceWithLocation }) => (
    <View style={styles.attendanceRow}>
      <View style={styles.attendanceMain}>
        <Text style={styles.attendanceDate}>{formatDateTime(item.timestamp)}</Text>
        <Text style={styles.attendanceLocation}>{item.location_name}</Text>
      </View>
      <View
        style={[
          styles.statusBadge,
          item.status === 'check_in' ? styles.checkInBadge : styles.checkOutBadge,
        ]}
      >
        <Text style={styles.statusText}>
          {item.status === 'check_in' ? 'IN' : 'OUT'}
        </Text>
      </View>
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
        <Text style={styles.title}>Admin Panel</Text>
        <Text style={styles.subtitle}>{employees.length} employees</Text>
      </View>

      <FlatList
        data={employees}
        renderItem={renderEmployee}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No employees found</Text>
          </View>
        }
      />

      {/* Employee Attendance Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={selectedEmployee !== null}
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedEmployee?.full_name}</Text>
                <Text style={styles.modalSubtitle}>{selectedEmployee?.email}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedEmployee(null)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={styles.filtersSection}>
              <Text style={styles.filterLabel}>Date Range</Text>
              <View style={styles.dateRow}>
                <View style={styles.dateControl}>
                  <TouchableOpacity
                    style={styles.dateArrow}
                    onPress={() => adjustDate('start', -1)}
                  >
                    <Text style={styles.dateArrowText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
                  <TouchableOpacity
                    style={styles.dateArrow}
                    onPress={() => adjustDate('start', 1)}
                  >
                    <Text style={styles.dateArrowText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.dateSeparator}>to</Text>
                <View style={styles.dateControl}>
                  <TouchableOpacity
                    style={styles.dateArrow}
                    onPress={() => adjustDate('end', -1)}
                  >
                    <Text style={styles.dateArrowText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
                  <TouchableOpacity
                    style={styles.dateArrow}
                    onPress={() => adjustDate('end', 1)}
                  >
                    <Text style={styles.dateArrowText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.filterLabel}>Location</Text>
              <View style={styles.locationFilters}>
                <TouchableOpacity
                  style={[
                    styles.locationFilterBtn,
                    !selectedLocationFilter && styles.locationFilterBtnActive,
                  ]}
                  onPress={() => setSelectedLocationFilter(null)}
                >
                  <Text
                    style={[
                      styles.locationFilterText,
                      !selectedLocationFilter && styles.locationFilterTextActive,
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {locations.map((loc) => (
                  <TouchableOpacity
                    key={loc.id}
                    style={[
                      styles.locationFilterBtn,
                      selectedLocationFilter === loc.id && styles.locationFilterBtnActive,
                    ]}
                    onPress={() => setSelectedLocationFilter(loc.id || null)}
                  >
                    <Text
                      style={[
                        styles.locationFilterText,
                        selectedLocationFilter === loc.id && styles.locationFilterTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {loc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>

            {/* Attendance List */}
            {attendanceLoading ? (
              <View style={styles.attendanceLoading}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            ) : (
              <FlatList
                data={employeeAttendance}
                renderItem={renderAttendanceRecord}
                keyExtractor={(item) => item.id || Math.random().toString()}
                style={styles.attendanceList}
                ListEmptyComponent={
                  <View style={styles.emptyAttendance}>
                    <Text style={styles.emptyAttendanceText}>
                      No attendance records found for this period
                    </Text>
                  </View>
                }
              />
            )}
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
    paddingHorizontal: 20,
    paddingTop: 80,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
  employeeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  employeeMainArea: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  employeeInfo: {
    flex: 1,
  },
  deviceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  deviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  deviceBound: {
    backgroundColor: '#4CAF50',
  },
  deviceUnbound: {
    backgroundColor: '#9e9e9e',
  },
  deviceText: {
    fontSize: 12,
    color: '#666',
  },
  resetRequestBadge: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  resetRequestText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e65100',
  },
  resetDeviceButton: {
    backgroundColor: '#fff3e0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  resetDeviceText: {
    color: '#e65100',
    fontSize: 13,
    fontWeight: '600',
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  employeeEmail: {
    fontSize: 14,
    color: '#666',
  },
  roleBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  adminBadge: {
    backgroundColor: '#e3f2fd',
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4caf50',
    textTransform: 'capitalize',
  },
  adminRoleText: {
    color: '#1976d2',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
    marginTop: 60,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  closeButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  filtersSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dateControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 8,
  },
  dateArrow: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  dateArrowText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  dateValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  dateSeparator: {
    marginHorizontal: 12,
    color: '#666',
  },
  locationFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  locationFilterBtn: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  locationFilterBtnActive: {
    backgroundColor: '#007AFF',
  },
  locationFilterText: {
    fontSize: 13,
    color: '#666',
  },
  locationFilterTextActive: {
    color: '#fff',
  },
  applyButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  attendanceLoading: {
    padding: 40,
    alignItems: 'center',
  },
  attendanceList: {
    flex: 1,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  attendanceMain: {
    flex: 1,
  },
  attendanceDate: {
    fontSize: 14,
    fontWeight: '500',
  },
  attendanceLocation: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  checkInBadge: {
    backgroundColor: '#e8f5e9',
  },
  checkOutBadge: {
    backgroundColor: '#ffebee',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyAttendance: {
    padding: 40,
    alignItems: 'center',
  },
  emptyAttendanceText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
