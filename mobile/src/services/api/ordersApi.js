import { IntegrationUnavailableError } from './errors';

export async function fetchOrders(params) {
  throw new IntegrationUnavailableError('Orders (List)');
}

export async function fetchOrderDetails(id) {
  throw new IntegrationUnavailableError('Orders (Detail)');
}

export async function fetchOrderRequirements(id) {
  throw new IntegrationUnavailableError('Orders (Requirements)');
}
