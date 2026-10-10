# ESP32 RFID attendance scanner

An ESP32 DevKit and an RC522 reader that send card scans to the ERP. The firmware only reads a card UID and posts it. The server works out who the card belongs to, which shift the scan counts for, whether the worker is late, and whether the scan is a duplicate. This is the same pipeline the **virtual scanner** in the app uses, so moving from the simulator to hardware needs no backend change.

> **Status:** the four physical cards (Ravi 72FAC35C, Priya 31636E40, Arjun 91B76E40, Meena 51278B40) are registered by `npm run seed:rfid`, and scanner `GATE_01` is registered with the key in `server/.env`. The endpoint was tested with `curl` at `http://10.184.54.76:4000`. The full sketch has not yet been run against the backend on real hardware.

## Contents

| Path | What it is |
|---|---|
| `rfid_uid_reader/rfid_uid_reader.ino` | Minimal sketch with no Wi-Fi. It checks the wiring and prints each card's UID in the format the ERP stores. |
| `esp32_rfid_attendance/esp32_rfid_attendance.ino` | The full scanner: Wi-Fi, read, POST, retries, reconnects and duplicate suppression. |
| `esp32_rfid_attendance/config.example.h` | Copy it to `config.h` and fill it in. `config.h` is git-ignored. |

## Hardware

- ESP32 DevKit (ESP32-WROOM-32)
- MFRC522 / RC522 13.56 MHz reader
- 13.56 MHz MIFARE cards or tags (the demo uses four)

### Wiring

| RC522 pin | ESP32 pin | Notes |
|---|---|---|
| SDA (SS) | GPIO 5 | chip select |
| SCK | GPIO 18 | VSPI clock |
| MOSI | GPIO 23 | |
| MISO | GPIO 19 | |
| RST | GPIO 22 | |
| 3.3V | 3V3 | **3.3 V only.** 5 V can damage the RC522. |
| GND | GND | |
| IRQ | not connected | |

```
 RC522                ESP32 DevKit
 ┌─────────┐          ┌──────────────┐
 │ SDA  ───┼──────────┼─ GPIO 5      │
 │ SCK  ───┼──────────┼─ GPIO 18     │
 │ MOSI ───┼──────────┼─ GPIO 23     │
 │ MISO ───┼──────────┼─ GPIO 19     │
 │ IRQ     │ (n/c)    │              │
 │ GND  ───┼──────────┼─ GND         │
 │ RST  ───┼──────────┼─ GPIO 22     │
 │ 3.3V ───┼──────────┼─ 3V3         │
 └─────────┘          └──────────────┘
```

## Software setup (Arduino IDE)

1. Install the ESP32 board package. Go to **File → Preferences → Additional boards manager URLs** and add `https://espressif.github.io/arduino-esp32/package_esp32_index.json`. Then open **Boards Manager** and install **esp32 by Espressif Systems**.
2. In the **Library Manager**, install **MFRC522** by GithubCommunity (miguelbalboa). `WiFi` and `HTTPClient` come with the ESP32 core.
3. Choose **Board: ESP32 Dev Module** and the right COM port. Set the Serial Monitor to **115200** baud.

## Step 1: read the four physical card UIDs

1. Flash `rfid_uid_reader/rfid_uid_reader.ino`.
2. Open the Serial Monitor. It should print `RC522 firmware version: 0x92` (or `0x91`/`0x88`/`0xB2`) and `RC522 ready`.
3. Hold each card on the reader. Write down each line such as `UID: 04A1B2C3` against the worker who will carry that card.

## Step 2: replace the placeholder UIDs (no code or SQL)

The demo seed gave Ravi, Priya, Arjun and Meena **placeholder** UIDs. In the app they are tagged *Awaiting physical card*.

1. Sign in as the owner, or any role with **rfid.manage**.
2. Go to **People → RFID attendance → Cards**, or **People → Workers**.
3. On the worker's row, click **Replace card**, paste the UID from Step 1 and save. The old placeholder is deactivated and kept in the history.

If you scan a card nobody owns, it appears in the scan log as **Unknown card** with its UID, so you can also copy UIDs from there.

## Step 3: register the scanner and get its device key

**Demo scanner `GATE_01`:** `npm run seed:rfid` (in `server/`) registers it. On the first run it generates a random key and writes it to `server/.env` as `RFID_DEMO_DEVICE_KEY`; the key is never printed or committed. Open `server/.env` locally and copy that value into `config.h`. To use your own key instead, set `RFID_DEMO_DEVICE_KEY` (64 hex characters, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and run the seed again; it updates the stored hash.

For more scanners, use one of these:

- **In the app:** go to **RFID attendance → Scanners → Register a scanner**, enter the Device ID (for example `GATE_01`) and copy the key. **It is shown only once.**
- **From the command line** (in `server/`):
  ```bash
  npm run rfid:device -- GATE_01 "Main gate"
  ```
  To issue a new key later (the old one stops working), run `npm run rfid:device -- GATE_01 --rotate` or click **Rotate key** in the app.

The server stores only a SHA-256 hash of the key. Never commit the key or put it in the React app.

## Step 4: configure and flash the scanner

1. Copy `esp32_rfid_attendance/config.example.h` to `esp32_rfid_attendance/config.h`.
2. Set `WIFI_SSID` and `WIFI_PASSWORD`. The network must be 2.4 GHz.
3. Set `API_URL` to `http://<laptop LAN IP>:4000/api/v1/iot/rfid-scan`.
   - Find the LAN IP on Windows with `ipconfig` (IPv4 Address of the Wi-Fi adapter, for example `192.168.1.10`). On macOS or Linux use `ipconfig getifaddr en0` or `ip addr`.
   - **Do not use `localhost` or `127.0.0.1`.** On the ESP32 those addresses point to the ESP32 itself.
   - The laptop and the ESP32 must be on the same Wi-Fi. Phone hotspots work; "guest" or "client isolation" networks do not.
4. Set `DEVICE_ID` (exactly as registered) and `DEVICE_KEY`.
5. Flash `esp32_rfid_attendance.ino`. The Serial Monitor shows:
   ```
   Sameta RFID scanner GATE_01 -> http://192.168.1.10:4000/api/v1/iot/rfid-scan
   [rfid] RC522 version 0x92 (ok)
   [wifi] connected, IP 192.168.1.42, RSSI -55 dBm
   [rfid] card 04A1B2C3
   [scan] 04A1B2C3 -> accepted | Ravi | Checked in
   ```
   The LED gives one long blink for accepted and short blinks for duplicate, unknown or error.

## The API the firmware calls

```
POST /api/v1/iot/rfid-scan
X-Device-Key: <device key>
Content-Type: application/json

{ "cardUid": "A1B2C3D4", "deviceId": "GATE_01", "eventId": "GATE_01-1A2B3C4D-17" }
```

- Every processed scan returns `200 { "data": { "success", "status", "employee": {name, role}, "cardUid", "deviceId", "timestamp", "status": "accepted" | "duplicate" | "unknown_card" | "invalid_employee" | "rejected", "attendance_action", "message", "worker", "shift", ... } }`.
- `400 BAD_REQUEST` means a malformed body or card UID. `401 DEVICE_UNAUTHORIZED` means an unknown device or the wrong key. `403 DEVICE_DISABLED` means the scanner was switched off in the app. `429` means more than 120 requests a minute from one IP address.
- The timestamp is always the server's. The mill comes from the device, never from the request.
- `eventId` makes retries safe: the same device and `eventId` returns the first answer and changes nothing.

Test it without hardware, using a device you registered:

```bash
curl -X POST http://localhost:4000/api/v1/iot/rfid-scan -H "Content-Type: application/json" -H "X-Device-Key: <key>" -d '{"cardUid":"A1B2C3D4","deviceId":"GATE_01","eventId":"test-1"}'
```

On Windows PowerShell, use `curl.exe` and escape the inner quotes, or call `Invoke-RestMethod` with a hashtable body.

## What a scan does

1. The first valid scan in the worker's shift creates their attendance check-in. The status is *present*, or *late* after the shift start plus the grace period.
2. A worker **without a default shift** is checked into the shift running at that moment and is never marked late, because there is no roster to judge against.
3. A scan of the same card within 3 seconds (`RFID_DUPLICATE_WINDOW_SEC`) of its last accepted scan is recorded as a **duplicate** and ignored. After that, a rescan is recorded as *already checked in*. Neither marks attendance a second time.
4. Later scans in the same shift are recorded as *already checked in*. **There is no automatic check-out.** A supervisor completes the day in Attendance, so raw scans never become paid hours.
5. A scan outside a rostered worker's shift window (from 2 hours before the start to the end of the shift) is recorded, but no check-in is made.
6. Scans never create production output.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `RC522 version 0x00` or `0xFF` | Wiring or power. Check 3.3 V and GND, then SDA→5, SCK→18, MOSI→23, MISO→19, RST→22. Re-seat the jumper wires; breadboard contacts often fail. |
| Version is fine but cards never read | Hold the card flat and close (1–3 cm) and keep metal away. Check that the cards are 13.56 MHz (125 kHz EM cards do not work with the RC522). |
| `[wifi] not connected` | The network is 5 GHz only, the SSID or password is wrong, or the signal is weak. The ESP32 keeps retrying every 10 s. |
| `connection refused` or `read Timeout` | Wrong IP address, the backend is not running, or the **Windows Firewall** is blocking port 4000. Allow Node.js on private networks, or add an inbound rule for TCP 4000. Test from a phone on the same Wi-Fi by opening `http://<LAN IP>:4000/health`. |
| `HTTP 401` | `DEVICE_ID` does not match a registered hardware scanner, or the key is wrong or was rotated. |
| `HTTP 403` | The scanner was deactivated in **RFID attendance → Scanners**. |
| `unknown_card` | The card is not assigned. Assign or replace it in **Cards**. |
| `rejected` | The card was deactivated. Give the worker a new card. |
| Every scan is `duplicate` | The same card was scanned again within the 3 s duplicate window. |
| `read Timeout` although `/health` works | The backend uses a remote database, so a scan takes about 4–7 s. The sketch waits 15 s. If it still times out, check the laptop's internet connection. |
| `accepted` but "outside the worker's shift window" | The worker has a default shift and the scan is outside it. Check the worker's shift, or clear it for the demo. |
| Brown-outs or resets when Wi-Fi starts | Use a good USB cable and port. Power the RC522 from 3V3, not from a separate supply with a different ground. |

## Security and deployment

- **Plain HTTP is only acceptable on a trusted local hackathon network.** The device key travels in a header, so anyone on the same network could capture it over HTTP.
- In deployment:
  - Put the API behind **HTTPS**. Render and Railway provide TLS, or use a reverse proxy with a valid certificate.
  - Change `API_URL` to `https://…` and use `WiFiClientSecure` with the server's root CA (`client.setCACert(...)`). Do not use `setInsecure()` in production.
  - Issue one key per scanner, rotate keys when a device is lost, and deactivate unused scanners in the app.
  - Set `NODE_ENV=production` or `RFID_SIMULATOR_ENABLED=false` on the server to turn off the virtual scanner.
- The firmware never logs the key. Do not commit `config.h`.

## Hardware verification checklist (still to do)

- [ ] `rfid_uid_reader` reports an RC522 version and reads all four cards.
- [ ] The four placeholder UIDs are replaced in the app. No card shows *Awaiting physical card*.
- [ ] The scanner is registered and the key is in `config.h`.
- [ ] `/health` loads from a phone on the same Wi-Fi (this confirms the firewall and IP).
- [ ] Scanning each card shows `accepted … Checked in`, and the live board updates within 2 s with source **hardware** and device `GATE_01`.
- [ ] Holding a card on the reader or rescanning it shows **duplicate**.
- [ ] An unassigned card shows **unknown_card**.
- [ ] With the backend stopped, the scanner retries, gives up cleanly, and works again once the backend is back.
- [ ] Turning Wi-Fi off and on lets the scanner reconnect without a reset.
