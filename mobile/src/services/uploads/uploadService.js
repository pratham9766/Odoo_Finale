import { IntegrationUnavailableError } from '../api/errors';

export async function uploadImage(uri, path) {
  throw new IntegrationUnavailableError('Uploads (Image Upload)');
}
