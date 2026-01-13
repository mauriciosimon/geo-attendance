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
import { AttendanceRecord, Location } from '../types';
import { calculateDistance } from '../utils/geofencing';

const TEMP_USER_ID = 'user-123';

interface LocationTimeSummary {
  locationId: string;
  locationName: string;
  totalMinutes: number;
  sessions: number;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to last 7 days
    return d;
  });
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<LocationTimeSummary[]>([]);
  const [totalTime, setTotalTime] = useState(0);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    const { locations: locs } = await getLocations();
    setLocations(locs);
  };

  const generateReport = useCallback(async () => {
    setLoading(true);
    try {
      const { records, error } = await getAttendanceByDateRange(
        TEMP_USER_ID,
        startDate,
        endDate
      );

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      // Calculate time per location
      const locationTimeMap = new Map<string, { name: string; minutes: number; sessions: number }>();

      for (let i = 0; i < records.length; i++) {
        const record = records[i];

        if (record.status === 'check_in') {
          // Find the matching check_out
          const checkOutIndex = records.findIndex(
            (r, idx) => idx > i && r.status === 'check_out'
          );

          if (checkOutIndex !== -1) {
            const checkOut = records[checkOutIndex];
            const checkInTime = new Date(record.timestamp).getTime();
            const checkOutTime = new Date(checkOut.timestamp).getTime();
            const durationMinutes = (checkOutTime - checkInTime) / (1000 * 60);

            // Find the location for this check-in
            const location = findNearestLocation(
              record.latitude,
              record.longitude,
              locations
            );

            const locationId = location?.id || 'unknown';
            const locationName = location?.name || 'Unknown Location';

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
        }
      }

      // Convert to array and sort by time
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

      setSummaries(summaryArray);
      setTotalTime(total);
    } catch (err) {
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, locations]);

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
    if (summaries.length === 0) {
      Alert.alert('No Data', 'Generate a report first before exporting');
      return;
    }

    try {
      // Build CSV content
      let csv = 'Location,Total Time,Hours,Sessions\n';

      for (const summary of summaries) {
        const hours = (summary.totalMinutes / 60).toFixed(2);
        csv += `"${summary.locationName}",${formatDuration(summary.totalMinutes)},${hours},${summary.sessions}\n`;
      }

      csv += `\n"TOTAL",${formatDuration(totalTime)},${(totalTime / 60).toFixed(2)},${summaries.reduce((a, b) => a + b.sessions, 0)}\n`;
      csv += `\nReport Period: ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
      csv += `Generated: ${new Date().toISOString()}\n`;

      const filename = `attendance-report-${formatDate(startDate)}-to-${formatDate(endDate)}.csv`;

      if (Platform.OS === 'web') {
        // Web: create downloadable link
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Success', 'CSV file downloaded');
      } else {
        // Native: use expo-file-system and expo-sharing
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
          Alert.alert('Success', `File saved to: ${fileUri}`);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to export CSV');
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
              onPress={() => setPresetRange(7)}
            >
              <Text style={styles.presetButtonText}>Last 7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.presetButton}
              onPress={() => setPresetRange(30)}
            >
              <Text style={styles.presetButtonText}>Last 30 days</Text>
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
              <Text style={styles.generateButtonText}>Generate Report</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Summary Table */}
        {summaries.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Time Summary</Text>
              <TouchableOpacity style={styles.exportButton} onPress={exportCSV}>
                <Text style={styles.exportButtonText}>Export CSV</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.locationCell]}>Location</Text>
                <Text style={[styles.tableHeaderCell, styles.timeCell]}>Time</Text>
                <Text style={[styles.tableHeaderCell, styles.sessionsCell]}>Sessions</Text>
              </View>

              {summaries.map((summary) => (
                <View key={summary.locationId} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.locationCell]} numberOfLines={1}>
                    {summary.locationName}
                  </Text>
                  <Text style={[styles.tableCell, styles.timeCell]}>
                    {formatDuration(summary.totalMinutes)}
                  </Text>
                  <Text style={[styles.tableCell, styles.sessionsCell]}>
                    {summary.sessions}
                  </Text>
                </View>
              ))}

              <View style={[styles.tableRow, styles.totalRow]}>
                <Text style={[styles.tableCell, styles.locationCell, styles.totalText]}>
                  TOTAL
                </Text>
                <Text style={[styles.tableCell, styles.timeCell, styles.totalText]}>
                  {formatDuration(totalTime)}
                </Text>
                <Text style={[styles.tableCell, styles.sessionsCell, styles.totalText]}>
                  {summaries.reduce((a, b) => a + b.sessions, 0)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {summaries.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Select a date range and tap "Generate Report" to see your time summary
            </Text>
          </View>
        )}
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
    padding: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableCell: {
    padding: 12,
    fontSize: 14,
    color: '#333',
  },
  locationCell: {
    flex: 2,
  },
  timeCell: {
    flex: 1,
    textAlign: 'center',
  },
  sessionsCell: {
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
});
