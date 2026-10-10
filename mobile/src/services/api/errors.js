export class IntegrationUnavailableError extends Error {
  constructor(feature) {
    super(`${feature} is not connected yet.`);
    this.name = 'IntegrationUnavailableError';
    this.code = 'INTEGRATION_UNAVAILABLE';
  }
}
