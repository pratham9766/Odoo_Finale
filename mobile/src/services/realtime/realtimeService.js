import { IntegrationUnavailableError } from '../api/errors';

export function connectRealtime(token, orgId) {
  throw new IntegrationUnavailableError('Realtime (WebSocket Connection)');
}

export function subscribeToOrder(orderId, callback) {
  throw new IntegrationUnavailableError('Realtime (Order Subscription)');
}
