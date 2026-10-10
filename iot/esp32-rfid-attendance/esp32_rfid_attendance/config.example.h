// Copy this file to config.h (same folder) and fill in your values. config.h is git-ignored: never commit it.
#pragma once

// Wi-Fi (2.4 GHz only; the ESP32 cannot join 5 GHz networks)
#define WIFI_SSID     "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// The ERP backend. Use the laptop's LAN IP (ipconfig → IPv4 Address), NOT localhost / 127.0.0.1:
// on the ESP32, "localhost" is the ESP32 itself.
#define API_URL "http://10.184.54.76:4000/api/v1/iot/rfid-scan"   // re-check with ipconfig if the Wi-Fi changes

// Demo scanner GATE_01 is registered by `npm run seed:rfid`; its key is RFID_DEMO_DEVICE_KEY in server/.env.
// (Other scanners: RFID attendance → Scanners → Register, key shown once.) DEVICE_ID must match exactly.
#define DEVICE_ID  "GATE_01"
#define DEVICE_KEY "PASTE_THE_64_CHARACTER_DEVICE_KEY_HERE"

// The same card held on the reader is sent once per this many milliseconds (the server also ignores
// repeats within RFID_DUPLICATE_WINDOW_SEC, 3 s by default).
#define LOCAL_REPEAT_MS 3000

// Optional status LED (most DevKits have a blue LED on GPIO 2). Set to -1 to disable.
#define STATUS_LED_PIN 2
