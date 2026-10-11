# Physical-device test checklist

**Status: almost nothing below has been checked on a device.** Done on an Android 16 emulator in *preview* mode (sample data, no login): the app starts, the dashboard, menu, machine board and work-order screens render, the numeric keypad appears with the field and button still visible, and the review dialog and saved banner work. **Everything else is NOT PERFORMED**, in particular live sign-in, the camera, session expiry, TalkBack, large fonts, small phones and offline behaviour. The bundle compiles (`expo export`), the logic is covered by `npm test`, and the server by `npm run test:db`. Tick a box only after you have watched it happen. Use a real login of each role you care about (QC Inspector, Operator, Supervisor, Store Keeper, Office, Employee).

## Sign-in and access
- [ ] Wrong password shows an error and does not sign in.
- [ ] A valid account **without** a role shows "Waiting for access" and no data.
- [ ] A disabled account shows "Account disabled".
- [ ] Each role sees only its own menu items, and opening a screen it lacks shows "Access restricted".
- [ ] Sign out works with Wi-Fi **off** (the app returns to the sign-in screen).
- [ ] Sign in as a second person on the same phone: none of the first person's lists or drafts appear.
- [ ] Close and reopen the app: still signed in; lists load.

## Session expiry
- [ ] Leave the app in the background for longer than the token lifetime, return, open any list: it loads (token renewed) without asking to sign in again.
- [ ] Revoke the session in Supabase (or change the password elsewhere), then use the app: it ends in the sign-in screen with a clear message, not a blank list.

## Production output (the lost-response test)
- [ ] Log output normally: "Saved", the work-order total rises by exactly that amount.
- [ ] Turn Wi-Fi off, log output: it says **Not confirmed**, shows an entry under "Unconfirmed", and does not claim success.
- [ ] Turn Wi-Fi on, tap **Send again**: it is saved once; the total rose once.
- [ ] Repeat, but kill the app while the entry is unconfirmed, reopen it: the entry is **still listed**. **Check if saved** and **Send again** work.
- [ ] Tap "Add output" repeatedly and fast: only one entry is made.
- [ ] Enter 5000 on a work order with a small target: refused with the limit and a plain explanation, for every role (the supervisor button only appears if the mill has switched the exception on).
- [ ] Type an unfinished entry, leave the screen, return: the draft is still there; sign out and in as someone else: it is not.

## QC
- [ ] Scan a roll label with the camera: the roll is shown (number, order, machine, length) **before** you choose a result.
- [ ] Deny the camera permission: you get a clear message, the "type the roll number" route works, and "Open phone settings" appears if you chose "don't ask again".
- [ ] Scan the same label twice quickly: one scan is accepted.
- [ ] Scan something that is not a roll label: "No roll found".
- [ ] Choose Reject or Rework without a defect: refused with the reason. With a defect: a confirmation states what will happen.
- [ ] Inspect a roll that someone else has already inspected: you are told its current status.

## Dispatch
- [ ] Scan a passed roll of the right order: added, totals change.
- [ ] Scan the same roll again: "already on this dispatch", nothing doubled.
- [ ] Scan a roll of another order / one not passed / one already dispatched: each is refused with its own advice.
- [ ] Remove a roll, scan it again.
- [ ] Confirm the dispatch: asks first, creates the invoice, the button cannot be pressed twice.
- [ ] Turn Wi-Fi off while confirming: it says **Not confirmed** and refreshes; it does not show success.

## Attendance
- [ ] A supervisor sees "Needs correction" with the unresolved card check-ins and the payroll warning.
- [ ] Enter a check-out before the check-in: refused. Night shift: "Next day" works. A reason is required.
- [ ] After saving, the hours shown match what you entered and the row leaves the list.
- [ ] A user who can only view attendance cannot correct.
- [ ] On the web, preparing the wage run is refused while a row is still open, and works after.

## Usability
- [ ] Phone font size set to the largest: no text is cut off, buttons are still tappable.
- [ ] A small phone (about 5"): forms are usable with the keyboard open; the Save button is reachable.
- [ ] Android back button: closes dialogs and the menu first, then goes back a screen.
- [ ] A tablet or landscape: content is centred; the menu stays open beside it on a wide screen.
- [ ] TalkBack: buttons are announced with their purpose; statuses are read as words.
- [ ] Slow network (throttle or weak Wi-Fi): spinners appear, timeouts give a message, nothing freezes.
- [ ] Pull to refresh on each list; "Updated hh:mm" changes.

## Consistency with the web
- [ ] Log output on the phone; reload the web work-order page: the same total. (The web polls, so allow up to a minute.)
- [ ] Confirm a dispatch on the phone; the web dispatch page shows it confirmed after a refresh.
