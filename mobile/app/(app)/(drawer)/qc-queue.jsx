import React from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, Card, useTheme, Chip, Button, FAB } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../../../src/context/Session';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export default function QcQueueScreen() {
  const theme = useTheme();
  const { api, can } = useSession();
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['qc-queue'],
    queryFn: ({ signal }) => api('/qc/queue?status=pending_qc', { signal }),
    enabled: !!can('qc.view'),
  });

  if (!can('qc.view')) {
    return (
      <View style={styles.center}>
        <Text>You do not have permission to view QC queue.</Text>
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
        <Text style={{ color: theme.colors.error, marginBottom: 16 }}>Failed to load QC queue.</Text>
        <Button mode="contained" onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity onPress={() => router.push(`/qc/inspect?rollNo=${item.roll_no}`)} activeOpacity={0.7}>
      <Card style={styles.card}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>{item.roll_no}</Text>
            <Chip 
              textStyle={{ color: '#FFA000', fontWeight: 'bold' }}
              style={{ backgroundColor: '#FFA00020' }}
            >
              PENDING QC
            </Chip>
          </View>
          <Text variant="bodyMedium" style={styles.detailText}>Item: {item.item?.name || 'Unknown'}</Text>
          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="ruler" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6 }} />
            <Text variant="bodySmall" style={{ marginLeft: 4 }}>{item.length_m} m</Text>
            {item.order_no && (
              <>
                <MaterialCommunityIcons name="file-document-outline" size={16} color={theme.colors.onSurface} style={{ opacity: 0.6, marginLeft: 16 }} />
                <Text variant="bodySmall" style={{ marginLeft: 4 }}>{item.order_no}</Text>
              </>
            )}
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
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 24 }}>No rolls pending QC.</Text>}
        refreshing={isLoading}
        onRefresh={refetch}
      />
      <FAB
        icon="qrcode-scan"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color="#fff"
        onPress={() => router.push('/qc/inspect')}
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
    paddingBottom: 80,
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
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
