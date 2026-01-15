import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    const { Alert } = require('react-native');
    Alert.alert(title, message);
  }
};

export default function DeviceBlockedScreen() {
  const { blockedUserEmail, resetRequested, requestDeviceReset, signOut } = useAuth();
  const [requesting, setRequesting] = useState(false);

  const handleRequestReset = async () => {
    setRequesting(true);
    const success = await requestDeviceReset();
    setRequesting(false);

    if (success) {
      showAlert('Request Sent', 'Your device reset request has been sent to your administrator.');
    } else {
      showAlert('Error', 'Failed to send request. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔒</Text>
        </View>

        <Text style={styles.title}>Device Not Recognized</Text>

        <Text style={styles.message}>
          This account ({blockedUserEmail}) is registered to another device.
        </Text>

        <Text style={styles.submessage}>
          Please contact your administrator to reset your device access, or request a reset below.
        </Text>

        {resetRequested ? (
          <View style={styles.requestedBanner}>
            <Text style={styles.requestedIcon}>✓</Text>
            <Text style={styles.requestedText}>
              Device reset has been requested. Please wait for your administrator to approve.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.requestButton}
            onPress={handleRequestReset}
            disabled={requesting}
          >
            {requesting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.requestButtonText}>Request Device Reset</Text>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  submessage: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  requestButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  requestedBanner: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  requestedIcon: {
    fontSize: 20,
    color: '#4CAF50',
    marginRight: 12,
  },
  requestedText: {
    flex: 1,
    fontSize: 14,
    color: '#2e7d32',
    lineHeight: 20,
  },
  signOutButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  signOutText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
  },
});
