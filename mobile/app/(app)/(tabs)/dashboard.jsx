import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Card, useTheme, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const theme = useTheme();

  const renderMetric = (title, value, icon, color) => (
    <Card style={styles.metricCard}>
      <Card.Content style={styles.metricContent}>
        <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
        </View>
        <View>
          <Text variant="bodySmall" style={styles.metricTitle}>{title}</Text>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{value}</Text>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Operations overview</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.6 }}>Morning shift</Text>
        </View>
        <Avatar.Icon size={40} icon="domain" style={{ backgroundColor: theme.colors.primary }} />
      </View>

      <View style={styles.grid}>
        {renderMetric('Active orders', '8', 'file-document-outline', theme.colors.primary)}
        {renderMetric('Machines running', '6/8', 'cog', theme.colors.primary)}
        {renderMetric('Awaiting QC', '5', 'magnify', theme.colors.primary)}
        {renderMetric('Ready to dispatch', '2', 'truck-outline', theme.colors.primary)}
      </View>

      <Text variant="titleMedium" style={styles.sectionTitle}>Needs attention</Text>
      <Card style={styles.alertCard}>
        <Card.Content style={styles.alertRow}>
          <View style={[styles.dot, { backgroundColor: '#FFA000' }]} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>Yarn shortage · SO-1002</Text>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>Only 2 cones remaining</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurface} style={{ opacity: 0.4 }} />
        </Card.Content>
      </Card>

      <Card style={styles.alertCard}>
        <Card.Content style={styles.alertRow}>
          <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>M-04 breakdown</Text>
            <Text variant="bodySmall" style={{ opacity: 0.6 }}>Machine stopped at 9:12 AM</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurface} style={{ opacity: 0.4 }} />
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFF',
  },
  metricContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTitle: {
    opacity: 0.6,
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginBottom: 12,
  },
  alertCard: {
    backgroundColor: '#FFF',
    marginBottom: 8,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  }
});
