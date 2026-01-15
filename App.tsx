import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AttendanceScreen from './src/screens/AttendanceScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import ReportScreen from './src/screens/ReportScreen';
import AdminScreen from './src/screens/AdminScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import DeviceBlockedScreen from './src/screens/auth/DeviceBlockedScreen';

export type RootTabParamList = {
  CheckIn: undefined;
  Locations: undefined;
  Report: undefined;
  Admin: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    CheckIn: focused ? '✓' : '○',
    Locations: focused ? '◉' : '◎',
    Report: focused ? '▤' : '▧',
    Admin: focused ? '⚙' : '⚙',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? '#007AFF' : '#999' }}>
      {icons[name]}
    </Text>
  );
}

function AuthScreens() {
  const [showSignUp, setShowSignUp] = useState(false);

  if (showSignUp) {
    return <SignUpScreen onNavigateToLogin={() => setShowSignUp(false)} />;
  }

  return <LoginScreen onNavigateToSignUp={() => setShowSignUp(true)} />;
}

function MainApp() {
  const { loading, session, profile, signOut, isAdmin, deviceBlocked } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!session) {
    return <AuthScreens />;
  }

  if (deviceBlocked) {
    return <DeviceBlockedScreen />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            paddingBottom: 8,
            paddingTop: 8,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        })}
      >
        <Tab.Screen
          name="CheckIn"
          component={AttendanceScreen}
          options={{ tabBarLabel: 'Check In' }}
        />
        <Tab.Screen
          name="Locations"
          component={LocationsScreen}
          options={{ tabBarLabel: 'Locations' }}
        />
        <Tab.Screen
          name="Report"
          component={ReportScreen}
          options={{ tabBarLabel: 'Report' }}
        />
        {isAdmin && (
          <Tab.Screen
            name="Admin"
            component={AdminScreen}
            options={{ tabBarLabel: 'Admin' }}
          />
        )}
      </Tab.Navigator>

      {/* User profile header with sign out */}
      <View style={styles.userBanner}>
        <Text style={styles.userText} numberOfLines={1}>
          {profile?.full_name || profile?.email}
          {isAdmin && ' (Admin)'}
        </Text>
        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <MainApp />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  userBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingTop: 44,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  userText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  signOutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  signOutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
