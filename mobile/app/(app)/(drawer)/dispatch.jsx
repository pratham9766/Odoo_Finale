import React from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Chip, Button } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function DispatchScreen() {
  const theme = useTheme();
  const { api, can } = useSession();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dispatches'],
    queryFn: ({ signal }) => api('/dispatches', { signal }),
    enabled: !!can('dispatch.view'),
  });

  if (!can('dispatch.view')) {
    return (
      <View style={styles.center}>
        <Text>You do not have permission to view dispatches.</Text>
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
        <Text style={{ color: theme.colors.error, marginBottom: 16 }}>Failed to load dispatches.</Text>
        <Button mode="contained" onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return '#18794E';
      case 'packing': return '#FFA000';
      case 'in_transit': return theme.colors.primary;
      case 'cancelled': return theme.colors.error;
      default: return theme.colors.onSurfaceVariant;
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => router.push(`/dispatch/${item.id}`)} activeOpacity={0.7}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.dispatch_no}</Text>
            <Chip 
              textStyle={{ color: getStatusColor(item.status), fontWeight: 'bold' }}
              style={{ backgroundColor: getStatusColor(item.status) + '20' }}
            >
              {item.status.replace('_', ' ').toUpperCase()}
            </Chip>
          </View>
          <Text variant="bodyMedium" style={styles.detailText}>Buyer: {item.buyer?.name || 'Unknown'}</Text>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="package-variant-closed" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>{item.rolls_count || 0} rolls</Text>
            <MaterialCommunityIcons name="truck-outline" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6, marginLeft: 16 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>{item.vehicle_no || 'Unassigned'}</Text>
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
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No dispatches found.</Text>}
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
