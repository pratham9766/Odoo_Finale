import { IntegrationUnavailableError } from './errors';

export async function fetchMachineBoard(params) {
  throw new IntegrationUnavailableError('Production (Machine Board)');
}

export async function fetchWorkOrders(params) {
  throw new IntegrationUnavailableError('Production (Work Orders)');
}
