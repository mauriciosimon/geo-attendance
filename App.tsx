import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import AttendanceScreen from './src/screens/AttendanceScreen';
import LocationsScreen from './src/screens/LocationsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ReportScreen from './src/screens/ReportScreen';

export type RootTabParamList = {
  CheckIn: undefined;
  Locations: undefined;
  History: undefined;
  Report: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    CheckIn: focused ? '✓' : '○',
    Locations: focused ? '◉' : '◎',
    History: focused ? '▣' : '▢',
    Report: focused ? '▤' : '▧',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? '#007AFF' : '#999' }}>
      {icons[name]}
    </Text>
  );
}

export default function App() {
  return (
    <NavigationContainer>
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
          name="History"
          component={HistoryScreen}
          options={{ tabBarLabel: 'History' }}
        />
        <Tab.Screen
          name="Report"
          component={ReportScreen}
          options={{ tabBarLabel: 'Report' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
