import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Card, useTheme, Button, TextInput, Chip, Snackbar } from 'react-native-paper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../../src/context/Session';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function QCInspectScreen() {
  const { rollNo: initialRollNo, qrToken } = useLocalSearchParams();
  const theme = useTheme();
  const { api, can } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState(initialRollNo || qrToken || '');
  const [searchMode, setSearchMode] = useState(qrToken ? 'qr' : 'roll');
  const [activeRollNo, setActiveRollNo] = useState(initialRollNo || '');
  const [activeQrToken, setActiveQrToken] = useState(qrToken || '');
  const [remarks, setRemarks] = useState('');
  const [snackbarMessage, setSnackbarMessage] = useState('');

  useEffect(() => {
    if (initialRollNo) {
      setActiveRollNo(initialRollNo);
      setSearchMode('roll');
      setSearchInput(initialRollNo);
    }
    if (qrToken) {
      setActiveQrToken(qrToken);
      setSearchMode('qr');
      setSearchInput(qrToken);
    }
  }, [initialRollNo, qrToken]);

  // Backend /rolls/:rollNo only supports roll_no. QR token lookup for details is not supported.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['roll', activeRollNo],
    queryFn: ({ signal }) => api(`/rolls/${activeRollNo}`, { signal }),
    enabled: !!activeRollNo && searchMode === 'roll' && !!can('qc.view'),
    retry: false,
  });

  const roll = data?.data;

  const handleSearch = () => {
    const input = searchInput.trim();
    if (!input) return;
    
    if (searchMode === 'qr') {
      setActiveQrToken(input);
      setActiveRollNo('');
    } else {
      setActiveRollNo(input);
      setActiveQrToken('');
    }
  };

  const inspectMutation = useMutation({
    mutationFn: (result) => {
      // Backend inspectionSchema requires exactly one of roll_id OR qr_token
      const payload = { result, remarks: remarks || undefined };
      if (searchMode === 'qr') {
        payload.qr_token = activeQrToken;
      } else {
        payload.roll_id = roll?.id;
      }
      return api('/qc/inspections', { method: 'POST', body: payload });
    },
    onSuccess: () => {
      setSnackbarMessage('Inspection submitted successfully');
      setRemarks('');
      queryClient.invalidateQueries(['qc-queue']);
      if (activeRollNo) queryClient.invalidateQueries(['roll', activeRollNo]);
      setTimeout(() => router.back(), 1500);
    },
    onError: (err) => setSnackbarMessage(err.message || 'Inspection failed'),
  });

  const isSubmitting = inspectMutation.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={{ marginBottom: 12 }}>Manual Roll Lookup</Text>
            
            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
              <Button 
                mode={searchMode === 'roll' ? 'contained' : 'outlined'} 
                onPress={() => setSearchMode('roll')}
                style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                Roll No
              </Button>
              <Button 
                mode={searchMode === 'qr' ? 'contained' : 'outlined'} 
                onPress={() => setSearchMode('qr')}
                style={{ flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              >
                QR Token
              </Button>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                mode="outlined"
                label={searchMode === 'qr' ? "Enter QR Token" : "Enter Roll No"}
                value={searchInput}
                onChangeText={setSearchInput}
                style={{ flex: 1, backgroundColor: '#fff' }}
                onSubmitEditing={handleSearch}
              />
              <Button mode="contained" onPress={handleSearch} style={{ justifyContent: 'center' }}>
                {searchMode === 'qr' ? 'Set QR' : 'Find'}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {isLoading && <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />}
        
        {isError && !isLoading && searchMode === 'roll' && (
          <Text style={{ textAlign: 'center', color: theme.colors.error, marginTop: 24 }}>
            Roll not found or access denied.
          </Text>
        )}

        {searchMode === 'qr' && activeQrToken ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium" style={{ marginBottom: 12 }}>Submit Inspection (Blind)</Text>
              <Text variant="bodySmall" style={{ marginBottom: 12, opacity: 0.7 }}>
                The backend does not support looking up roll details by QR token before submission.
              </Text>
              
              <TextInput
                mode="outlined"
                label="Remarks (Optional)"
                value={remarks}
                onChangeText={setRemarks}
                multiline
                numberOfLines={3}
                style={{ backgroundColor: '#fff', marginBottom: 16 }}
              />

              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                <Button 
                  mode="contained" 
                  buttonColor="#18794E" 
                  onPress={() => inspectMutation.mutate('pass')}
                  loading={isSubmitting && inspectMutation.variables === 'pass'}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                >
                  Pass
                </Button>
                <Button 
                  mode="contained" 
                  buttonColor="#FFA000" 
                  onPress={() => inspectMutation.mutate('rework')}
                  loading={isSubmitting && inspectMutation.variables === 'rework'}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                >
                  Rework
                </Button>
                <Button 
                  mode="contained" 
                  buttonColor={theme.colors.error} 
                  onPress={() => inspectMutation.mutate('reject')}
                  loading={isSubmitting && inspectMutation.variables === 'reject'}
                  disabled={isSubmitting}
                  style={{ flex: 1 }}
                >
                  Reject
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : null}

        {searchMode === 'roll' && roll && !isLoading && (
          <>
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.rowBetween}>
                  <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>{roll.roll_no}</Text>
                  <Chip>{roll.status?.replace('_', ' ').toUpperCase()}</Chip>
                </View>
                <Text variant="bodyMedium" style={{ marginTop: 8 }}>Item: {roll.item_name || roll.item || 'Unknown'}</Text>
                <Text variant="bodyMedium">Length: {roll.length_m} m</Text>
                <Text variant="bodyMedium">Order: {roll.order_no || 'None'}</Text>
              </Card.Content>
            </Card>

            {roll.status === 'pending_qc' || roll.status === 'rework' ? (
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="titleMedium" style={{ marginBottom: 12 }}>Submit Inspection</Text>
                  
                  <TextInput
                    mode="outlined"
                    label="Remarks (Optional)"
                    value={remarks}
                    onChangeText={setRemarks}
                    multiline
                    numberOfLines={3}
                    style={{ backgroundColor: '#fff', marginBottom: 16 }}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'space-between' }}>
                    <Button 
                      mode="contained" 
                      buttonColor="#18794E" 
                      onPress={() => inspectMutation.mutate('pass')}
                      loading={isSubmitting && inspectMutation.variables === 'pass'}
                      disabled={isSubmitting}
                      style={{ flex: 1 }}
                    >
                      Pass
                    </Button>
                    <Button 
                      mode="contained" 
                      buttonColor="#FFA000" 
                      onPress={() => inspectMutation.mutate('rework')}
                      loading={isSubmitting && inspectMutation.variables === 'rework'}
                      disabled={isSubmitting}
                      style={{ flex: 1 }}
                    >
                      Rework
                    </Button>
                    <Button 
                      mode="contained" 
                      buttonColor={theme.colors.error} 
                      onPress={() => inspectMutation.mutate('reject')}
                      loading={isSubmitting && inspectMutation.variables === 'reject'}
                      disabled={isSubmitting}
                      style={{ flex: 1 }}
                    >
                      Reject
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            ) : (
              <Card style={styles.card}>
                <Card.Content>
                  <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
                    This roll is currently in status: {roll.status}. It cannot be inspected right now.
                  </Text>
                </Card.Content>
              </Card>
            )}
          </>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
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
