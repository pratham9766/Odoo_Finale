import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Button, TextInput, Chip, Snackbar } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { useSession } from '../../../src/context/Session';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function WorkOrderDetailScreen() {
  const { id } = useLocalSearchParams();
  const theme = useTheme();
  const { api, can, session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [rollLength, setRollLength] = useState('');
  const [createdRoll, setCreatedRoll] = useState(null);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [isUncertainState, setIsUncertainState] = useState(false);

  const uncertainKey = `uncertain_log_${session?.context?.org_id}_${session?.user?.id}_${id}`;

  useEffect(() => {
    SecureStore.getItemAsync(uncertainKey).then(val => {
      if (val === 'true') setIsUncertainState(true);
    });
  }, [uncertainKey]);

  const { data: woData, isLoading, refetch } = useQuery({
    queryKey: ['work-order', id],
    queryFn: ({ signal }) => api(`/work-orders/${id}`, { signal }),
    enabled: !!can('production.view'),
  });

  const wo = woData?.data;

  const handleMutationError = async (error) => {
    if (error?.message?.includes('network') || error?.message?.includes('timeout') || error?.message?.includes('Cannot reach')) {
      setIsUncertainState(true);
      await SecureStore.setItemAsync(uncertainKey, 'true');
      setSnackbarMessage('Network uncertainty. Outcome is explicitly unresolved.');
    } else {
      setSnackbarMessage(error.message || 'Action failed');
    }
  };

  const onSuccessAction = async () => {
    queryClient.invalidateQueries(['work-order', id]);
    queryClient.invalidateQueries(['work-orders']);
    queryClient.invalidateQueries(['production', 'board']);
    setSnackbarMessage('Action successful');
    setIsUncertainState(false);
    await SecureStore.deleteItemAsync(uncertainKey).catch(() => {});
  };

  const logMutation = useMutation({
    mutationFn: (qty) => api(`/work-orders/${id}/logs`, { method: 'POST', body: { qty } }),
    onSuccess: () => {
      setQtyInput('');
      onSuccessAction();
    },
    onError: handleMutationError,
  });

  const createRollMutation = useMutation({
    mutationFn: (length_m) => api(`/rolls`, { method: 'POST', body: { work_order_id: id, length_m } }),
    onSuccess: (res) => {
      setRollLength('');
      setCreatedRoll(res.data);
      onSuccessAction();
    },
    onError: handleMutationError,
  });

  const pauseMutation = useMutation({
    mutationFn: (reason) => api(`/work-orders/${id}/pause`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      setReasonInput('');
      onSuccessAction();
    },
    onError: handleMutationError,
  });

  const startMutation = useMutation({
    mutationFn: () => api(`/work-orders/${id}/${wo?.status === 'paused' ? 'resume' : 'start'}`, { method: 'POST' }),
    onSuccess: onSuccessAction,
    onError: handleMutationError,
  });

  const finishMutation = useMutation({
    mutationFn: (good_qty) => api(`/work-orders/${id}/finish`, { method: 'POST', body: { good_qty, waste_qty: 0 } }),
    onSuccess: () => {
      onSuccessAction();
      router.back();
    },
    onError: handleMutationError,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!wo) {
    return (
      <View style={styles.center}>
        <Text>Work order not found.</Text>
      </View>
    );
  }

  const isSubmitting = logMutation.isPending || pauseMutation.isPending || startMutation.isPending || finishMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.rowBetween}>
              <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{wo.code}</Text>
              <Chip>{wo.status.replace('_', ' ').toUpperCase()}</Chip>
            </View>
            <Text variant="bodyMedium" style={styles.mt2}>Item: {wo.item?.name}</Text>
            <Text variant="bodyMedium">Stage: {wo.stage?.name}</Text>
            <Text variant="bodyMedium" style={{ fontWeight: 'bold', marginTop: 8 }}>
              Progress: {wo.produced_qty || 0} / {wo.target_qty} {wo.unit}
            </Text>
          </Card.Content>
        </Card>

        {isUncertainState && (
          <Card style={[styles.card, { backgroundColor: theme.colors.error + '20' }]}>
            <Card.Content>
              <Text variant="titleMedium" style={{ color: theme.colors.error, fontWeight: 'bold' }}>Action Interrupted (Unresolved)</Text>
              <Text variant="bodyMedium" style={{ marginTop: 4 }}>
                The network connection dropped during your last action. Because the server does not expose individual log histories, it is impossible to know if your last submission succeeded.
              </Text>
              <Text variant="bodyMedium" style={{ marginTop: 8, fontWeight: 'bold' }}>
                Do not attempt to resubmit the same quantity. Contact your floor supervisor to manually reconcile the aggregate quantity in the web application.
              </Text>
              <Button mode="contained" onPress={() => refetch()} style={styles.mt4}>
                Refresh Aggregate Progress
              </Button>
            </Card.Content>
          </Card>
        )}

        {(wo.status === 'ready' || wo.status === 'paused') && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>Ready to {wo.status === 'paused' ? 'resume' : 'start'}?</Text>
              <Button 
                mode="contained" 
                onPress={() => startMutation.mutate()}
                loading={startMutation.isPending}
                disabled={isSubmitting || isUncertainState}
              >
                {wo.status === 'paused' ? 'Resume Production' : 'Start Production'}
              </Button>
            </Card.Content>
          </Card>
        )}

        {wo.status === 'in_progress' && (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Log Production</Text>
                <TextInput
                  label={`Quantity (${wo.unit})`}
                  value={qtyInput}
                  onChangeText={setQtyInput}
                  keyboardType="numeric"
                  style={styles.input}
                  disabled={isSubmitting || isUncertainState}
                />
                <Button 
                  mode="contained" 
                  onPress={() => logMutation.mutate(Number(qtyInput))}
                  loading={logMutation.isPending}
                  disabled={isSubmitting || !qtyInput || isUncertainState}
                  style={styles.mt2}
                >
                  Submit Log
                </Button>
              </Card.Content>
            </Card>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Create Fabric Roll</Text>
                <TextInput
                  label="Length (m)"
                  value={rollLength}
                  onChangeText={setRollLength}
                  keyboardType="numeric"
                  style={styles.input}
                  disabled={isSubmitting || isUncertainState}
                />
                <Button 
                  mode="outlined" 
                  onPress={() => createRollMutation.mutate(Number(rollLength))}
                  loading={createRollMutation.isPending}
                  disabled={isSubmitting || !rollLength || isUncertainState}
                  style={styles.mt2}
                >
                  Generate Roll & QR
                </Button>
                {createdRoll && (
                  <View style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f6f2', borderRadius: 8 }}>
                    <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Roll Created Successfully</Text>
                    <Text variant="bodyMedium">Roll No: {createdRoll.id}</Text>
                    <Text variant="bodySmall" style={{ opacity: 0.6 }}>QR Token: {createdRoll.qr_token}</Text>
                  </View>
                )}
              </Card.Content>
            </Card>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Report Breakdown / Pause</Text>
                <TextInput
                  label="Reason"
                  value={reasonInput}
                  onChangeText={setReasonInput}
                  style={styles.input}
                  disabled={isSubmitting || isUncertainState}
                />
                <Button 
                  mode="outlined" 
                  onPress={() => pauseMutation.mutate(reasonInput)}
                  loading={pauseMutation.isPending}
                  disabled={isSubmitting || !reasonInput || isUncertainState}
                  style={styles.mt2}
                  textColor={theme.colors.error}
                >
                  Pause Machine
                </Button>
              </Card.Content>
            </Card>

            <Card style={styles.card}>
              <Card.Content>
                <Text variant="titleMedium" style={{ marginBottom: 12 }}>Finish Work Order</Text>
                <Button 
                  mode="contained" 
                  onPress={() => finishMutation.mutate(wo.produced_qty)}
                  loading={finishMutation.isPending}
                  disabled={isSubmitting || isUncertainState}
                  buttonColor="#18794E"
                >
                  Mark as Finished
                </Button>
              </Card.Content>
            </Card>
          </>
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
  mt2: {
    marginTop: 8,
  },
  mt4: {
    marginTop: 16,
  },
  input: {
    backgroundColor: '#f5f6f2',
    marginBottom: 8,
  }
});
