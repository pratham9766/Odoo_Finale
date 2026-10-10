import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrg } from '@/hooks/useOrg';
import { useUrlState } from '@/hooks/useUrlState';
import { fetchOrders, fetchOrder, fetchOrderRequirements, createOrder, confirmOrder, reserveMaterial, cancelOrder } from './api';

const KEY = 'orders';

export function useOrders() {
  const { orgId } = useOrg();
  const [filters] = useUrlState({ status: 'all', search: '', page: 1, pageSize: 20 });

  return useQuery({
    queryKey: [KEY, orgId, filters],
    queryFn: ({ signal }) => fetchOrders({ orgId, ...filters, signal }),
    enabled: !!orgId,
  });
}

export function useOrder(id) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: [KEY, orgId, id],
    queryFn: ({ signal }) => fetchOrder({ id, orgId, signal }),
    enabled: !!orgId && !!id,
  });
}

export function useOrderRequirements(id) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: [KEY, orgId, id, 'requirements'],
    queryFn: ({ signal }) => fetchOrderRequirements({ id, orgId, signal }),
    enabled: !!orgId && !!id,
  });
}

export function useCreateOrder() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createOrder({ orgId, payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, orgId] }),
    retry: false,
  });
}

export function useConfirmOrder() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => confirmOrder({ id, orgId }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, orgId, id] });
      qc.invalidateQueries({ queryKey: [KEY, orgId] });
      qc.invalidateQueries({ queryKey: ['dashboard', orgId] });
    },
    retry: false,
  });
}

export function useReserveMaterial() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => reserveMaterial({ id, orgId }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, orgId, id] });
      qc.invalidateQueries({ queryKey: ['inventory', orgId] });
    },
    retry: false,
  });
}

export function useCancelOrder() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => cancelOrder({ id, orgId, reason }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [KEY, orgId, id] });
      qc.invalidateQueries({ queryKey: [KEY, orgId] });
    },
    retry: false,
  });
}
