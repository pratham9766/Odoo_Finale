import { IntegrationUnavailableError } from './errors';

export async function fetchStock(params) {
  throw new IntegrationUnavailableError('Inventory (Stock)');
}

export async function fetchReceipts(params) {
  throw new IntegrationUnavailableError('Inventory (Receipts)');
}

export async function postReceipt(payload) {
  throw new IntegrationUnavailableError('Inventory (Post Receipt)');
}
