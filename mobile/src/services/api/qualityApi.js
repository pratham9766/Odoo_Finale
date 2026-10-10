import { IntegrationUnavailableError } from './errors';

export async function fetchQCQueue(params) {
  throw new IntegrationUnavailableError('Quality (Queue)');
}

export async function lookupRoll(rollNo) {
  throw new IntegrationUnavailableError('Quality (Roll Lookup)');
}

export async function submitInspection(payload) {
  throw new IntegrationUnavailableError('Quality (Submit Inspection)');
}
