import React from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Chip, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';

export default function OrdersScreen() {
  const theme = useTheme();
  const { api, can } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: ({ signal }) => api('/orders', { signal }),
    enabled: !!can('orders.view'),
  });

  if (!can('orders.view')) {
    return (
      <View style={styles.center}>
        <Text>You do not have permission to view orders.</Text>
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
        <Text style={{ color: theme.colors.error, marginBottom: 16 }}>Failed to load orders.</Text>
        <Button mode="contained" onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.code}</Text>
          <Chip style={{ backgroundColor: theme.colors.primaryContainer }} textStyle={{ color: theme.colors.primary }}>
            {item.status.replace('_', ' ').toUpperCase()}
          </Chip>
        </View>
        <Text variant="bodyMedium" style={styles.detailText}>Buyer: {item.buyer?.name || 'Unknown'}</Text>
        {item.deadline && <Text variant="bodySmall" style={styles.detailText}>Due: {new Date(item.deadline).toLocaleDateString()}</Text>}
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
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No orders found.</Text>}
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
  }
});
