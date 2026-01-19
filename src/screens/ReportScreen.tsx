import React, { useState, useCallback, useEffect } from 'react';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getAttendanceByDateRange } from '../services/attendanceService';
import { getLocations } from '../services/locationsService';
import { useAuth } from '../context/AuthContext';
import { AttendanceRecord, Location } from '../types';
import { calculateDistance } from '../utils/geofencing';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

interface LocationTimeSummary {
  locationId: string;
  locationName: string;
  totalMinutes: number;
  sessions: number;
}

interface DetailedRecord extends AttendanceRecord {
  locationName: string;
  duration?: number; // duration in minutes (only for check_out)
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(timestamp: string): string {
  const d = new Date(timestamp);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function findNearestLocation(
  lat: number,
  lng: number,
  locations: Location[]
): Location | null {
  let nearest: Location | null = null;
  let minDistance = Infinity;

  for (const loc of locations) {
    const distance = calculateDistance(
      { latitude: lat, longitude: lng },
      { latitude: loc.latitude, longitude: loc.longitude }
    );
    if (distance <= loc.radius_meters && distance < minDistance) {
      minDistance = distance;
      nearest = loc;
    }
  }

  return nearest;
}

export default function ReportScreen() {
  const { user } = useAuth();
  const userId = user?.id || '';

  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1); // Default to first day of current month
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [detailedRecords, setDetailedRecords] = useState<DetailedRecord[]>([]);
  const [summaries, setSummaries] = useState<LocationTimeSummary[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    loadLocations();
  }, []);

  // Auto-generate report when locations are loaded
  useEffect(() => {
    if (locations.length >= 0 && userId) {
      generateReport();
    }
  }, [locations, userId]);

  const loadLocations = async () => {
    const { locations: locs } = await getLocations();
    setLocations(locs);
  };

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const { records, error } = await getAttendanceByDateRange(
        userId,
        startDate,
        endDate
      );

      if (error) {
        showAlert('Error', error.message);
        return;
      }

      // Build detailed records with location names and durations
      const detailed: DetailedRecord[] = [];
      const locationTimeMap = new Map<string, { name: string; minutes: number; sessions: number }>();

      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        const location = findNearestLocation(record.latitude, record.longitude, locations);
        const locationName = location?.name || 'Unknown Location';
        const locationId = location?.id || 'unknown';

        if (record.status === 'check_in') {
          // Find the matching check_out
          const checkOutIndex = records.findIndex(
            (r, idx) => idx > i && r.status === 'check_out'
          );

          detailed.push({
            ...record,
            locationName,
          });

          if (checkOutIndex !== -1) {
            const checkOut = records[checkOutIndex];
            const checkInTime = new Date(record.timestamp).getTime();
            const checkOutTime = new Date(checkOut.timestamp).getTime();
            const durationMinutes = (checkOutTime - checkInTime) / (1000 * 60);

            // Update summary map
            const existing = locationTimeMap.get(locationId);
            if (existing) {
              existing.minutes += durationMinutes;
              existing.sessions += 1;
            } else {
              locationTimeMap.set(locationId, {
                name: locationName,
                minutes: durationMinutes,
                sessions: 1,
              });
            }
          }
        } else if (record.status === 'check_out') {
          // Find the matching check_in before this check_out
          let duration: number | undefined;
          for (let j = i - 1; j >= 0; j--) {
            if (records[j].status === 'check_in') {
              const checkInTime = new Date(records[j].timestamp).getTime();
              const checkOutTime = new Date(record.timestamp).getTime();
              duration = (checkOutTime - checkInTime) / (1000 * 60);
              break;
            }
          }

          detailed.push({
            ...record,
            locationName,
            duration,
          });
        }
      }

      // Convert summary map to array
      const summaryArray: LocationTimeSummary[] = [];
      let total = 0;

      locationTimeMap.forEach((value, key) => {
        summaryArray.push({
          locationId: key,
          locationName: value.name,
          totalMinutes: value.minutes,
          sessions: value.sessions,
        });
        total += value.minutes;
      });

      summaryArray.sort((a, b) => b.totalMinutes - a.totalMinutes);

      setDetailedRecords(detailed);
      setSummaries(summaryArray);
      setTotalTime(total);
    } catch (err) {
      showAlert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, locations, userId]);

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

  const setPresetRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(start);
    setEndDate(end);
  };

  const exportCSV = async () => {
    if (detailedRecords.length === 0) {
      showAlert('No Data', 'No records to export');
      return;
    }

    try {
      // Build CSV content with detailed records
      let csv = 'Date,Time,Status,Location,Duration\n';

      for (const record of detailedRecords) {
        const date = new Date(record.timestamp).toLocaleDateString();
        const time = formatTime(record.timestamp);
        const status = record.status === 'check_in' ? 'Check In' : 'Check Out';
        const duration = record.duration ? formatDuration(record.duration) : '';
        csv += `"${date}","${time}","${status}","${record.locationName}","${duration}"\n`;
      }

      // Add summary section
      csv += '\n\nSUMMARY BY LOCATION\n';
      csv += 'Location,Total Time,Hours,Sessions\n';

      for (const summary of summaries) {
        const hours = (summary.totalMinutes / 60).toFixed(2);
        csv += `"${summary.locationName}",${formatDuration(summary.totalMinutes)},${hours},${summary.sessions}\n`;
      }

      csv += `\n"TOTAL",${formatDuration(totalTime)},${(totalTime / 60).toFixed(2)},${summaries.reduce((a, b) => a + b.sessions, 0)}\n`;
      csv += `\nReport Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
      csv += `Generated: ${new Date().toISOString()}\n`;

      const filename = `attendance-report-${formatDate(startDate)}-to-${formatDate(endDate)}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showAlert('Success', 'CSV file downloaded');
      } else {
        const fileUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'Export Attendance Report',
          });
        } else {
          showAlert('Success', `File saved to: ${fileUri}`);
        }
      }
    } catch (err) {
      showAlert('Error', 'Failed to export CSV');
      console.error(err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Report</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Date Range Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date Range</Text>

          <View style={styles.presetButtons}>
            <TouchableOpacity
              style={styles.presetButton}
              onPress={() => {
                const start = new Date();
                start.setDate(1);
                setStartDate(start);
                setEndDate(new Date());
              }}
            >
              <Text style={styles.presetButtonText}>This Month</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetButton}
              onPress={() => setPresetRange(7)}
            >
              <Text style={styles.presetButtonText}>Last 7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetButton}
              onPress={() => setPresetRange(0)}
            >
              <Text style={styles.presetButtonText}>Today</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateControl}>
              <Text style={styles.dateLabel}>From:</Text>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  style={styles.dateArrow}
                  onPress={() => adjustDate('start', -1)}
                >
                  <Text style={styles.dateArrowText}>◀</Text>
                </TouchableOpacity>
                <Text style={styles.dateValue}>{formatDate(startDate)}</Text>
                <TouchableOpacity
                  style={styles.dateArrow}
                  onPress={() => adjustDate('start', 1)}
                >
                  <Text style={styles.dateArrowText}>▶</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dateControl}>
              <Text style={styles.dateLabel}>To:</Text>
              <View style={styles.dateSelector}>
                <TouchableOpacity
                  style={styles.dateArrow}
                  onPress={() => adjustDate('end', -1)}
                >
                  <Text style={styles.dateArrowText}>◀</Text>
                </TouchableOpacity>
                <Text style={styles.dateValue}>{formatDate(endDate)}</Text>
                <TouchableOpacity
                  style={styles.dateArrow}
                  onPress={() => adjustDate('end', 1)}
                >
                  <Text style={styles.dateArrowText}>▶</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateReport}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.generateButtonText}>Apply Filter</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Detailed Records */}
        {detailedRecords.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Attendance Log</Text>
              <TouchableOpacity style={styles.exportButton} onPress={exportCSV}>
                <Text style={styles.exportButtonText}>Export CSV</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.dateTimeCell]}>Date/Time</Text>
                <Text style={[styles.tableHeaderCell, styles.statusCell]}>Status</Text>
                <Text style={[styles.tableHeaderCell, styles.locationCell]}>Location</Text>
                <Text style={[styles.tableHeaderCell, styles.durationCell]}>Duration</Text>
              </View>

              {detailedRecords.map((record, index) => (
                <View
                  key={record.id || index}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd,
                  ]}
                >
                  <Text style={[styles.tableCell, styles.dateTimeCell]}>
                    {formatDateTime(record.timestamp)}
                  </Text>
                  <View style={[styles.tableCell, styles.statusCell]}>
                    <View
                      style={[
                        styles.statusBadge,
                        record.status === 'check_in' ? styles.statusIn : styles.statusOut,
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>
                        {record.status === 'check_in' ? 'IN' : 'OUT'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.tableCell, styles.locationCell]} numberOfLines={1}>
                    {record.locationName}
                  </Text>
                  <Text style={[styles.tableCell, styles.durationCell]}>
                    {record.duration ? formatDuration(record.duration) : '-'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Summary by Location */}
        {summaries.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary by Location</Text>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.summaryLocationCell]}>Location</Text>
                <Text style={[styles.tableHeaderCell, styles.summaryTimeCell]}>Total Time</Text>
                <Text style={[styles.tableHeaderCell, styles.summarySessionsCell]}>Sessions</Text>
              </View>

              {summaries.map((summary) => (
                <View key={summary.locationId} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.summaryLocationCell]} numberOfLines={1}>
                    {summary.locationName}
                  </Text>
                  <Text style={[styles.tableCell, styles.summaryTimeCell]}>
                    {formatDuration(summary.totalMinutes)}
                  </Text>
                  <Text style={[styles.tableCell, styles.summarySessionsCell]}>
                    {summary.sessions}
                  </Text>
                </View>
              ))}

              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={[styles.tableCell, styles.summaryLocationCell, styles.totalText]}>
                  TOTAL
                </Text>
                <Text style={[styles.tableCell, styles.summaryTimeCell, styles.totalText]}>
                  {formatDuration(totalTime)}
                </Text>
                <Text style={[styles.tableCell, styles.summarySessionsCell, styles.totalText]}>
                  {summaries.reduce((a, b) => a + b.sessions, 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {detailedRecords.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No attendance records found for this date range
            </Text>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  presetButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  presetButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  presetButtonText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dateControl: {
    flex: 1,
    marginHorizontal: 4,
  },
  dateLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 8,
  },
  dateArrow: {
    padding: 4,
  },
  dateArrowText: {
    fontSize: 12,
    color: '#007AFF',
  },
  dateValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  generateButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  exportButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  table: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableHeaderCell: {
    padding: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#fff',
  },
  tableRowOdd: {
    backgroundColor: '#fafafa',
  },
  tableCell: {
    padding: 10,
    fontSize: 12,
    color: '#333',
  },
  dateTimeCell: {
    width: 100,
  },
  statusCell: {
    width: 50,
    alignItems: 'center',
  },
  locationCell: {
    flex: 1,
  },
  durationCell: {
    width: 60,
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusIn: {
    backgroundColor: '#4CAF50',
  },
  statusOut: {
    backgroundColor: '#f44336',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  summaryLocationCell: {
    flex: 2,
  },
  summaryTimeCell: {
    flex: 1,
    textAlign: 'center',
  },
  summarySessionsCell: {
    flex: 1,
    textAlign: 'center',
  },
  totalRow: {
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 0,
  },
  totalText: {
    fontWeight: '700',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  bottomPadding: {
    height: 100,
  },
});
