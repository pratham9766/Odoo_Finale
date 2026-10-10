# SAMETA Mobile App Setup

## Prerequisites (Windows)
1. Node.js (v20+ recommended)
2. Android Studio with Android SDK installed
3. A physical Android device or emulator
4. Expo Go app installed on your physical device (optional, for rapid preview)

## Installation
1. Navigate to the `mobile` folder:
   ```bash
   cd mobile
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in the public values. Do NOT include sensitive keys.

## Running on Android (USB Debugging)
1. Enable Developer Options and USB Debugging on your Android phone.
2. Connect your phone via USB.
3. Verify connection:
   ```bash
   adb devices
   ```
4. Start the Expo development server:
   ```bash
   npm start
   ```
5. Press `a` in the terminal to run on Android.

## Building a Standalone Preview APK
To build an installable APK for testing without the dev server:
1. Ensure you have an EAS account and run `eas login`.
2. Run the build command:
   ```bash
   eas build -p android --profile preview
   ```
3. Download the generated APK and install it on your device via USB:
   ```bash
   adb install path/to/app.apk
   ```

## Common Issues
- **adb not found**: Ensure the Android SDK platform-tools path is added to your Windows environment variables.
- **Connection timeout**: Ensure your phone and development machine are on the same local network, or use USB debugging exclusively.
