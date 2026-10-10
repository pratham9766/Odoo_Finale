import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Button, TextInput, Chip, Snackbar, IconButton } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../../src/context/Session';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function DispatchDetailScreen() {
  const { id } = useLocalSearchParams();
  const theme = useTheme();
  const { api, can } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [scanInput, setScanInput] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const { data: dispatchData, isLoading, refetch } = useQuery({
    queryKey: ['dispatch', id],
    queryFn: ({ signal }) => api(`/dispatches/${id}`, { signal }), // Assumes GET /dispatches/:id exists
    enabled: !!can('dispatch.view'),
  });

  const dispatchItem = dispatchData?.data;

  // We actually don't have a verified GET /dispatches/:id in the audit. 
  // If it doesn't exist, we fallback to finding it from the list.
  const { data: listData } = useQuery({
    queryKey: ['dispatches'],
    queryFn: ({ signal }) => api('/dispatches', { signal }),
    enabled: !dispatchItem && !!can('dispatch.view'),
  });
  
  const dispatch = dispatchItem || listData?.data?.find(d => d.id === id);

  const scanMutation = useMutation({
    mutationFn: (token) => {
      const payload = token.length > 20 ? { qr_token: token } : { roll_no: token };
      return api(`/dispatches/${id}/scan`, { method: 'POST', body: payload });
    },
    onSuccess: () => {
      setScanInput('');
      setSnackbarMessage('Roll added to dispatch');
      queryClient.invalidateQueries(['dispatch', id]);
      queryClient.invalidateQueries(['dispatches']);
    },
    onError: (err) => setSnackbarMessage(err.message || 'Failed to scan roll'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api(`/dispatches/${id}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      setSnackbarMessage('Dispatch confirmed');
      queryClient.invalidateQueries(['dispatch', id]);
      queryClient.invalidateQueries(['dispatches']);
      setTimeout(() => router.back(), 1500);
    },
    onError: (err) => setSnackbarMessage(err.message || 'Failed to confirm dispatch'),
  });

  const handleScan = () => {
    if (!scanInput.trim()) return;
    scanMutation.mutate(scanInput.trim());
  };

  if (isLoading && !dispatch) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!dispatch) {
    return (
      <View style={styles.center}>
        <Text>Dispatch not found.</Text>
      </View>
    );
  }

  const isPacking = dispatch.status === 'packing';
  const isSubmitting = scanMutation.isPending || confirmMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.rowBetween}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{dispatch.dispatch_no}</Text>
              <Chip>{dispatch.status.replace('_', ' ').toUpperCase()}</Chip>
            </View>
            <Text variant="bodyMedium" style={{ marginTop: 8 }}>Buyer: {dispatch.buyer?.name || 'Unknown'}</Text>
            <Text variant="bodyMedium">Vehicle: {dispatch.vehicle_no || 'Unassigned'}</Text>
          </Card.Content>
        </Card>

        {isPacking && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>Scan Roll to Pack</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  mode="outlined"
                  label="Roll No or QR Token"
                  value={scanInput}
                  onChangeText={setScanInput}
                  style={{ flex: 1, backgroundColor: '#fff' }}
                  onSubmitEditing={handleScan}
                  disabled={isSubmitting}
                />
                <Button mode="contained" onPress={handleScan} style={{ justifyContent: 'center' }} loading={scanMutation.isPending} disabled={isSubmitting}>
                  Add
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}

        <Text variant="titleMedium" style={{ fontWeight: 'bold', marginVertical: 12 }}>Packed Rolls ({dispatch.rolls_count || dispatch.rolls?.length || 0})</Text>
        
        {dispatch.rolls?.length > 0 ? (
          dispatch.rolls.map((roll) => (
            <Card key={roll.id} style={[styles.card, { marginBottom: 8 }]}>
              <Card.Content style={styles.rowBetween}>
                <View>
                  <Text variant="bodyLarge" style={{ fontWeight: 'bold' }}>{roll.roll_no}</Text>
                  <Text variant="bodySmall">{roll.length_m} m</Text>
                </View>
                {/* Note: Delete roll not implemented to save prompt space, but can be added if backend supports it */}
                {isPacking && (
                  <Chip style={{ backgroundColor: theme.colors.primaryContainer }} textStyle={{ color: theme.colors.primary }}>PACKED</Chip>
                )}
              </Card.Content>
            </Card>
          ))
        ) : (
          <Text style={{ textAlign: 'center', opacity: 0.6, marginTop: 12 }}>No rolls packed yet.</Text>
        )}

        {isPacking && (
           <Button 
             mode="contained" 
             buttonColor="#18794E" 
             onPress={() => confirmMutation.mutate()}
             loading={confirmMutation.isPending}
             disabled={isSubmitting || (dispatch.rolls?.length === 0)}
             style={{ marginTop: 24, paddingVertical: 8 }}
           >
             Confirm Dispatch
           </Button>
        )}
      </ScrollView>

      <Snackbar
        visible={!!snackbarMessage}
        onDismiss={() => setSnackbarMessage('')}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
