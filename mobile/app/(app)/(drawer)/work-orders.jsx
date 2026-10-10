import React from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, Card, useTheme, Chip, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function WorkOrdersScreen() {
  const theme = useTheme();
  const { api, can } = useSession();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['work-orders'],
    queryFn: ({ signal }) => api('/work-orders?status=ready,in_progress,paused', { signal }),
    enabled: !!can('production.view'),
  });

  if (!can('production.view')) {
    return (
      <View style={styles.center}>
        <Text>You do not have permission to view work orders.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.error, marginBottom: 16 }}>Failed to load work orders.</Text>
        <Button mode="contained" onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'in_progress': return '#18794E';
      case 'paused': return '#FFA000';
      case 'ready': return theme.colors.primary;
      default: return theme.colors.onSurfaceVariant;
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => router.push(`/work-order/${item.id}`)} activeOpacity={0.7}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.code}</Text>
            <Chip 
              textStyle={{ color: getStatusColor(item.status), fontWeight: 'bold' }}
              style={{ backgroundColor: getStatusColor(item.status) + '20' }}
            >
              {item.status.replace('_', ' ').toUpperCase()}
            </Chip>
          </View>
          <Text variant="bodyMedium" style={styles.detailText}>Stage: {item.stage?.name || 'Unknown'}</Text>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="tag-outline" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>{item.item?.name || 'Unknown item'}</Text>
            <MaterialCommunityIcons name="factory" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6, marginLeft: 16 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>
              {item.produced_qty || 0} / {item.target_qty} {item.unit || 'units'}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={data?.data || []}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No assigned work orders found.</Text>}
        refreshing={isLoading}
        onRefresh={refetch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 16,
  },
  card: {
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    opacity: 0.7,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#f5f6f2',
    padding: 8,
    borderRadius: 6,
    alignSelf: 'flex-start'
  }
});
