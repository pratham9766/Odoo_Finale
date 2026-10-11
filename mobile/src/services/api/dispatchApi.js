import { IntegrationUnavailableError } from './errors';

export async function fetchDispatches(params) {
  throw new IntegrationUnavailableError('Dispatch (List)');
}

export async function fetchDispatchDetails(id) {
  throw new IntegrationUnavailableError('Dispatch (Detail)');
}

export async function scanRollForDispatch(id, rollNo) {
  throw new IntegrationUnavailableError('Dispatch (Scan Roll)');
}

export async function confirmDispatch(id, payload) {
  throw new IntegrationUnavailableError('Dispatch (Confirm)');
}
