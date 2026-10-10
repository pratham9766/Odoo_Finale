# QA Checklist

## Navigation & Layout
- [ ] App launches without backend credentials.
- [ ] Side panels open consistently from the left (drawers).
- [ ] Bottom tabs used sparingly for primary modules.
- [ ] Responsive layouts scale correctly on phones and tablets.
- [ ] Long content scrolls correctly.
- [ ] Keyboard does not obscure form inputs (KeyboardAvoidingView).
- [ ] UI honors Safe Areas on devices with notches/gestures.

## Authentication & Security
- [ ] Sign in and Signup forms have proper autofill and validation.
- [ ] Password visibility toggle works.
- [ ] Unknown roles are handled safely (setup/access denied state).
- [ ] Sensitive app state is cleared on logout.
- [ ] Missing backend integrations correctly throw IntegrationUnavailableError and display honestly.

## Organization Isolation
- [ ] Caches and queries are partitioned by organization.
- [ ] Switching organizations clears stale views and resets context.
- [ ] No leakage of data between tenants.

## Device Features
- [ ] Camera/QR scanner requests permissions politely.
- [ ] Manual entry is available as a fallback for QR scanning.
- [ ] Camera is paused when not active.
- [ ] Photo attachment handles compression, cancellation, and denial gracefully.
- [ ] Notifications request permissions at logical points.

## Business Logic
- [ ] Textile business statuses (produced, rejected, dispatched) are preserved cleanly.
- [ ] Meters and kilograms are kept distinct.
- [ ] Empty states provide clear next steps.
- [ ] Failed requests do not silently display "No records".
