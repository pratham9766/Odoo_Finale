-- 018 (Vipul): OTP brute-force lock for trip delivery (§11.11: 5 wrong tries -> 15 min lock)
alter table trips add column otp_attempts int not null default 0;
alter table trips add column otp_locked_until timestamptz;
create index trips_driver_idx on trips(driver_id) where driver_id is not null;   -- driver app: my trips
