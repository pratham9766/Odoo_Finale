import React from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Chip, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function MachineBoardScreen() {
  const theme = useTheme();
  const { api, can } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['production', 'board'],
    queryFn: ({ signal }) => api('/production/board', { signal }),
    enabled: !!can('production.view'),
  });

  if (!can('production.view')) {
    return (
      <View style={styles.center}>
        <Text>You do not have permission to view the machine board.</Text>
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
        <Text style={{ color: theme.colors.error, marginBottom: 16 }}>Failed to load machines.</Text>
        <Button mode="contained" onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#18794E';
      case 'breakdown': return theme.colors.error;
      case 'idle': return '#FFA000';
      default: return theme.colors.onSurfaceVariant;
    }
  };

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{item.code}</Text>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
        </View>
        <Text variant="bodyMedium" style={{ opacity: 0.7 }}>Stage: {item.stage?.name || 'Unknown'}</Text>
        {item.currentOrder && (
          <View style={styles.orderBadge}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>Order: {item.currentOrder.code}</Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={data?.data || []}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No machines configured.</Text>}
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
    marginBottom: 4,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  orderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#f5f6f2',
    padding: 6,
    borderRadius: 4,
    alignSelf: 'flex-start'
  }
});
