export function demoAllowed(config, remoteAddress, origin) {
  return config.NODE_ENV === 'development' && config.DEMO_LOGIN_ENABLED === true
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
    && origin === config.CLIENT_URL;
}
