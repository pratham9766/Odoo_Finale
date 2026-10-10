export default {
  expo: {
    name: 'SAMETA',
    slug: 'sameta-mobile',
    scheme: 'sameta',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundColor: '#F5F7F9'
      },
      package: 'com.sameta.app'
    },
    web: {
      favicon: './assets/favicon.png'
    },
    extra: {
      eas: {
        projectId: 'your-eas-project-id'
      }
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      'expo-camera',
      'expo-image-picker'
    ]
  }
};
