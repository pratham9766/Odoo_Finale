import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrders, fetchOrder, fetchOrderRequirements,
  createOrder, confirmOrder, reserveMaterial, cancelOrder,
  planOrder, createTrackingLink,
} from './api';

const KEY = 'orders';

export function useOrders(filters = {}) {
  return useQuery({
    queryKey: [KEY, filters],
    queryFn: ({ signal }) => fetchOrders({ ...filters, signal }),
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn: ({ signal }) => fetchOrder({ id, signal }),
    enabled: !!id,
  });
}

export function useOrderRequirements(id) {
  return useQuery({
    queryKey: [KEY, id, 'requirements'],
    queryFn: ({ signal }) => fetchOrderRequirements({ id, signal }),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createOrder(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConfirmOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => confirmOrder(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useReserveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => reserveMaterial(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => cancelOrder({ id, reason }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
      qc.invalidateQueries({ queryKey: [KEY] });
    },
  });
}

export function usePlanOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => planOrder(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}

export function useTrackingLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => createTrackingLink(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: [KEY, id] });
    },
  });
}
