# SAMETA Development Setup & Provisioning Instructions

This guide provides the exact steps required to provision the local development environment for live, end-to-end device testing of the mobile app.

*Note: Migrations define the schema but do not populate test business data. You must seed the database manually or via a script.*

## 1. Initialize the Database Schema

Ensure you have a local PostgreSQL instance running (or point `MIGRATION_DATABASE_URL` in `server/.env` to an isolated Supabase project).

```bash
cd db
node migrate.js
```

## 2. Create Your Real Supabase Account
Since the `DemoLogin` component was removed to harden the app, you must register a real user:
1. Ensure the web application (`client`) is running.
2. Open the web app on your laptop and navigate to the **Sign Up / Login** screen.
3. Register using your email and password.
4. Supabase Auth will generate a unique `user_id` (UUID).

## 3. Link Your Account to a Factory Membership
To act as a factory operator/QC manager, your `user_id` must be bound to an organization profile inside the `memberships` table.

Run the following SQL in your Supabase SQL Editor (or local psql terminal):

```sql
-- 1. Create a dummy organization (the factory)
INSERT INTO organizations (id, name, kind)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Mill', 'mill');

-- 2. Create your user profile (matches your Supabase user_id)
INSERT INTO profiles (id, name, email)
VALUES ('<YOUR_SUPABASE_USER_ID>', 'Dev User', 'your.email@example.com');

-- 3. Bind your profile to the factory
INSERT INTO memberships (org_id, profile_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '<YOUR_SUPABASE_USER_ID>', 'admin');
```

## 4. Provision Production Test Data
To test the mobile app flows (Production → QC → Dispatch), you need active records. Run this SQL block to seed them:

```sql
-- 1. Create an Item
INSERT INTO items (id, org_id, name, type, kind)
VALUES ('item-0001', '00000000-0000-0000-0000-000000000001', 'Cotton Fabric', 'product', 'fabric');

-- 2. Create a Buyer Order
INSERT INTO orders (id, org_id, seller_org_id, buyer_org_id, order_no, status)
VALUES ('order-0001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'buyer-org-01', 'ORD-2026-0001', 'in_production');

-- 3. Create a Stage and Machine
INSERT INTO stages (id, org_id, name, sequence) VALUES ('stage-01', '00000000-0000-0000-0000-000000000001', 'Weaving', 1);
INSERT INTO machines (id, org_id, code, stage_id, status) VALUES ('mach-01', '00000000-0000-0000-0000-000000000001', 'W-01', 'stage-01', 'running');

-- 4. Create an active Work Order
INSERT INTO work_orders (id, org_id, order_id, stage_id, machine_id, output_item_id, wo_no, target_qty, produced_qty, status)
VALUES ('wo-0001', '00000000-0000-0000-0000-000000000001', 'order-0001', 'stage-01', 'mach-01', 'item-0001', 'WO-01', 1000, 0, 'in_progress');

-- 5. Create a Roll ready for QC
INSERT INTO rolls (id, org_id, order_id, item_id, work_order_id, roll_no, qr_token, length_m, status)
VALUES ('roll-0001', '00000000-0000-0000-0000-000000000001', 'order-0001', 'item-0001', 'wo-0001', 'R-1-001', 'test-qr-token', 100, 'pending_qc');

-- 6. Create an open Dispatch
INSERT INTO dispatches (id, from_org_id, to_org_id, order_id, dispatch_no, status)
VALUES ('disp-0001', '00000000-0000-0000-0000-000000000001', 'buyer-org-01', 'order-0001', 'DSP-0001', 'packing');
```

## 5. Start Services & Verify Phone Reachability
1. **Find your actual IP:** Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux). Look for the IPv4 address (e.g., `192.168.1.5`).
2. **Update Environments:** 
   - Set `CLIENT_URL=http://<YOUR_IP>:5173` in `server/.env`.
   - Set `EXPO_PUBLIC_API_URL=http://<YOUR_IP>:4000/api/v1` in `mobile/.env`.
3. **Start the backend:** `cd server && npm run dev`
4. **Start the mobile packager:** `cd mobile && npm run start -- --lan`
5. Ensure your phone and laptop are on the same WiFi network. Scan the Expo QR code using your physical device.
