import { IntegrationUnavailableError } from '../api/errors';

export async function login(email, password) {
  throw new IntegrationUnavailableError('Authentication (Login)');
}

export async function signup(email, password, name) {
  throw new IntegrationUnavailableError('Authentication (Signup)');
}

export async function recoverPassword(email) {
  throw new IntegrationUnavailableError('Authentication (Recovery)');
}
