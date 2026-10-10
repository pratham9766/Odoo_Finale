import React from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';

export default function DashboardScreen() {
  const theme = useTheme();
  const { api, context } = useSession();

  // We assemble the dashboard manually as there's no dedicated endpoint.
  // We use enabled checks to only fetch what the user has permission for.
  const hasOrdersView = context?.permissions?.includes('orders.view');
  const hasProductionView = context?.permissions?.includes('production.view');
  const hasQcView = context?.permissions?.includes('qc.view');

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['orders'],
    queryFn: ({ signal }) => api('/orders?limit=1', { signal }),
    enabled: !!hasOrdersView,
  });

  const { data: boardData, isLoading: loadingBoard } = useQuery({
    queryKey: ['production', 'board'],
    queryFn: ({ signal }) => api('/production/board', { signal }),
    enabled: !!hasProductionView,
  });

  const { data: qcData, isLoading: loadingQc } = useQuery({
    queryKey: ['qc', 'queue'],
    queryFn: ({ signal }) => api('/qc/queue?status=pending_qc', { signal }),
    enabled: !!hasQcView,
  });

  // Calculate metrics
  const activeOrders = ordersData?.meta?.total || '—';
  const machines = boardData?.data || [];
  const machinesRunning = machines.filter(m => m.status === 'running').length;
  const totalMachines = machines.length;
  const machineMetric = totalMachines > 0 ? `${machinesRunning}/${totalMachines}` : '—';
  
  const awaitingQc = qcData?.data?.length || '—';

  // Find alerts (e.g. machine breakdowns)
  const breakdowns = machines.filter(m => m.status === 'breakdown');

  const renderMetric = (title, value, icon, color, loading) => (
    <Card style={styles.metricCard}>
      <Card.Content style={styles.metricContent}>
        <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
          <MaterialCommunityIcons name={icon} size={24} color={color} />
        </View>
        <View>
          <Text variant="bodySmall" style={styles.metricTitle}>{title}</Text>
          {loading ? (
            <ActivityIndicator size="small" color={color} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          ) : (
            <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{value}</Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Operations overview</Text>
          <Text variant="bodyMedium" style={{ opacity: 0.6 }}>{context?.org_name || 'Workspace'}</Text>
        </View>
        <Avatar.Icon size={40} icon="domain" style={{ backgroundColor: theme.colors.primary }} />
      </View>

      <View style={styles.grid}>
        {hasOrdersView && renderMetric('Active orders', activeOrders, 'file-document-outline', theme.colors.primary, loadingOrders)}
        {hasProductionView && renderMetric('Machines running', machineMetric, 'cog', theme.colors.primary, loadingBoard)}
        {hasQcView && renderMetric('Awaiting QC', awaitingQc, 'magnify', theme.colors.primary, loadingQc)}
      </View>

      {breakdowns.length > 0 && (
        <>
          <Text variant="titleMedium" style={styles.sectionTitle}>Needs attention</Text>
          {breakdowns.map(m => (
            <Card key={m.id} style={styles.alertCard}>
              <Card.Content style={styles.alertRow}>
                <View style={[styles.dot, { backgroundColor: theme.colors.error }]} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>{m.code} breakdown</Text>
                  <Text variant="bodySmall" style={{ opacity: 0.6 }}>Machine is currently stopped</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurface} style={{ opacity: 0.4 }} />
              </Card.Content>
            </Card>
          ))}
        </>
      )}
      
      {breakdowns.length === 0 && !loadingBoard && hasProductionView && (
        <Card style={styles.alertCard}>
          <Card.Content style={styles.alertRow}>
             <View style={[styles.dot, { backgroundColor: '#18794E' }]} />
             <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>All systems nominal</Text>
                <Text variant="bodySmall" style={{ opacity: 0.6 }}>No reported machine breakdowns</Text>
             </View>
          </Card.Content>
        </Card>
      )}
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
