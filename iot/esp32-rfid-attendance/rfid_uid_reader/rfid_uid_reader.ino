// Minimal RC522 UID reader for ESP32. No Wi-Fi, no server.
// Use it first: it proves the wiring and prints each card's UID in the exact format the ERP stores
// (upper-case hex, no separators), so you can replace the placeholder UIDs in Workers / RFID attendance → Cards.
//
// Library: "MFRC522" by GithubCommunity (miguelbalboa), Arduino Library Manager.
// Board:   ESP32 Dev Module. Serial Monitor: 115200 baud.

#include <SPI.h>
#include <MFRC522.h>

#define PIN_SS   5    // SDA/SS
#define PIN_RST  22   // RST
// SCK 18, MOSI 23, MISO 19 are the ESP32 VSPI defaults

MFRC522 rfid(PIN_SS, PIN_RST);

String uidHex(const MFRC522::Uid &uid) {
  String s;
  for (byte i = 0; i < uid.size; i++) {
    if (uid.uidByte[i] < 0x10) s += '0';
    s += String(uid.uidByte[i], HEX);
  }
  s.toUpperCase();
  return s;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  SPI.begin(18, 19, 23, PIN_SS);   // SCK, MISO, MOSI, SS
  rfid.PCD_Init();
  delay(50);

  byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  Serial.printf("\nRC522 firmware version: 0x%02X\n", version);
  if (version == 0x00 || version == 0xFF) {
    Serial.println("RC522 NOT detected. Check 3.3V/GND, SDA->GPIO5, SCK->18, MOSI->23, MISO->19, RST->22.");
  } else {
    Serial.println("RC522 ready. Hold a card on the reader.");
  }
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  MFRC522::PICC_Type type = rfid.PICC_GetType(rfid.uid.sak);
  Serial.printf("UID: %s   (%d bytes, %s)\n", uidHex(rfid.uid).c_str(), rfid.uid.size, rfid.PICC_GetTypeName(type));

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000);
}
