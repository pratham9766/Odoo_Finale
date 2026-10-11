import { IntegrationUnavailableError } from '../api/errors';

export async function registerPushToken(token) {
  throw new IntegrationUnavailableError('Notifications (Register Token)');
}

export async function fetchNotifications() {
  throw new IntegrationUnavailableError('Notifications (Fetch)');
}
