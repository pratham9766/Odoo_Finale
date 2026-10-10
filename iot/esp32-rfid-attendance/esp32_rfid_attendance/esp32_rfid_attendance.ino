// ESP32 + RC522 RFID attendance scanner for the Sameta ERP.
//   card → UID (upper-case hex) → POST {cardUid, deviceId, eventId} with X-Device-Key → server decides everything.
// The firmware knows no employees: who the card belongs to, shifts, lateness and duplicates are all server-side.
//
// Setup: copy config.example.h to config.h and fill it in. Libraries: "MFRC522" (miguelbalboa) from the Library Manager;
// WiFi and HTTPClient come with the ESP32 Arduino core. Board: ESP32 Dev Module. Serial Monitor: 115200 baud.
//
// Plain HTTP is only for a trusted local hackathon network. See README.md for HTTPS in deployment.

#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include "config.h"

#define PIN_SS   5
#define PIN_RST  22
#define PIN_SCK  18
#define PIN_MISO 19
#define PIN_MOSI 23

const uint8_t  MAX_ATTEMPTS = 3;           // per scan, same eventId each time so the server never counts it twice
const uint16_t HTTP_TIMEOUT_MS = 15000;   // the backend talks to a remote database: a scan can take 4-7 s
const uint32_t WIFI_RETRY_MS = 10000;
const uint32_t READER_CHECK_MS = 30000;

MFRC522 rfid(PIN_SS, PIN_RST);
String lastUid;
uint32_t lastUidAt = 0;
uint32_t lastWifiTry = 0;
uint32_t lastReaderCheck = 0;
uint32_t scanCounter = 0;

// ---- helpers --------------------------------------------------------------------------------------------------------

String uidHex(const MFRC522::Uid &uid) {
  String s;
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += '0';
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

/** Unique per scan, also across reboots: DEVICE_ID + random boot id + counter. */
String newEventId() {
  static uint32_t bootId = esp_random();
  char buf[64];
  snprintf(buf, sizeof(buf), "%s-%08lX-%lu", DEVICE_ID, (unsigned long)bootId, (unsigned long)++scanCounter);
  return String(buf);
}

void led(bool on) {
  if (STATUS_LED_PIN >= 0) digitalWrite(STATUS_LED_PIN, on ? HIGH : LOW);
}

void blink(uint8_t times, uint16_t ms) {
  for (uint8_t i = 0; i < times; i++) { led(true); delay(ms); led(false); delay(ms); }
}

/** Value of a top-level "key":"value" string in the JSON response (enough for status / message / name). */
String jsonString(const String &body, const char *key) {
  String needle = String("\"") + key + "\":\"";
  int start = body.indexOf(needle);
  if (start < 0) return "";
  start += needle.length();
  int end = body.indexOf('"', start);
  return end < 0 ? "" : body.substring(start, end);
}

// ---- Wi-Fi ----------------------------------------------------------------------------------------------------------

void connectWifi(bool blocking) {
  if (WiFi.status() == WL_CONNECTED) return;
  if (!blocking && millis() - lastWifiTry < WIFI_RETRY_MS) return;
  lastWifiTry = millis();
  Serial.printf("[wifi] connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  if (!blocking) return;
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print('.'); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, IP %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[wifi] not connected yet; will keep retrying in the background");
  }
}

// ---- server ---------------------------------------------------------------------------------------------------------

/** Send one scan. Retries only network failures and 5xx; a 4xx is final (fix the config, not the network). */
void sendScan(const String &uid) {
  String eventId = newEventId();
  String payload = String("{\"cardUid\":\"") + uid + "\",\"deviceId\":\"" + DEVICE_ID + "\",\"eventId\":\"" + eventId + "\"}";

  for (uint8_t attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[scan] Wi-Fi down, reconnecting before sending");
      connectWifi(true);
      if (WiFi.status() != WL_CONNECTED) { delay(500 * attempt); continue; }
    }

    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.setConnectTimeout(HTTP_TIMEOUT_MS);
    if (!http.begin(API_URL)) {
      Serial.println("[scan] bad API_URL in config.h");
      return;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", DEVICE_KEY);         // never printed
    int code = http.POST(payload);
    String body = code > 0 ? http.getString() : "";
    http.end();

    if (code == 200) {
      String status = jsonString(body, "status");
      String name = jsonString(body, "name");
      String message = jsonString(body, "message");
      Serial.printf("[scan] %s -> %s%s%s | %s\n", uid.c_str(), status.c_str(), name.length() ? " | " : "", name.c_str(), message.c_str());
      if (status == "accepted") blink(1, 300);
      else blink(3, 80);                                   // duplicate / unknown / rejected
      return;
    }
    if (code == 401 || code == 403) {
      Serial.printf("[scan] HTTP %d: the server refused this scanner. Check DEVICE_ID / DEVICE_KEY and that the scanner is active.\n", code);
      blink(5, 60);
      return;
    }
    if (code >= 400 && code < 500) {
      Serial.printf("[scan] HTTP %d: request rejected: %s\n", code, jsonString(body, "message").c_str());
      blink(5, 60);
      return;
    }
    // network error (code < 0) or server error: retry with the same eventId
    Serial.printf("[scan] attempt %u/%u failed: %s\n", attempt, MAX_ATTEMPTS,
                  code < 0 ? HTTPClient::errorToString(code).c_str() : (String("HTTP ") + code).c_str());
    delay(500 * attempt);
  }
  Serial.printf("[scan] giving up on %s after %u attempts. Is the backend running and reachable at API_URL?\n", uid.c_str(), MAX_ATTEMPTS);
  blink(5, 60);
}

// ---- reader ---------------------------------------------------------------------------------------------------------

bool readerAlive() {
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  return v != 0x00 && v != 0xFF;
}

void initReader() {
  SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI, PIN_SS);
  rfid.PCD_Init();
  delay(50);
  byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("[rfid] RC522 version 0x%02X %s\n", v, readerAlive() ? "(ok)" : "(NOT detected: check wiring and 3.3 V)");
}

// ---- main -----------------------------------------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(200);
  if (STATUS_LED_PIN >= 0) pinMode(STATUS_LED_PIN, OUTPUT);
  Serial.printf("\nSameta RFID scanner %s -> %s\n", DEVICE_ID, API_URL);   // the key is deliberately not logged
  initReader();
  connectWifi(true);
}

void loop() {
  connectWifi(false);

  if (millis() - lastReaderCheck > READER_CHECK_MS) {   // a loose wire or brown-out can reset the RC522
    lastReaderCheck = millis();
    if (!readerAlive()) { Serial.println("[rfid] reader not responding, re-initialising"); initReader(); }
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  String uid = uidHex(rfid.uid);
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  if (uid == lastUid && millis() - lastUidAt < LOCAL_REPEAT_MS) return;   // card still on the reader
  lastUid = uid;
  lastUidAt = millis();

  Serial.printf("[rfid] card %s\n", uid.c_str());
  led(true);
  sendScan(uid);
  led(false);
}
