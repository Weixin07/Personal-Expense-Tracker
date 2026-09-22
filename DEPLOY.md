# Deploying the Expense Tracker

This is the single, end-to-end guide for building and installing a **release** Android
build of the Expense Tracker on your own device. It covers environment setup, keystore
generation, Google OAuth configuration, release signing, the build itself, on-device
testing, distribution options, and OAuth/PKCE details with troubleshooting.

For architecture, the dev workflow, and the full troubleshooting catalogue, see
[`README.md`](./README.md). This guide is the _how-to_; the README is the _reference_.

> **Commands** are shown in PowerShell (the primary dev environment is Windows). Replace
> `<project-root>` with the path to the repository root on your machine.

---

## Prerequisites

Confirm your toolchain before starting (versions are pinned by the repo):

```powershell
node --version        # v24.11.1 (pinned via .nvmrc)
pnpm --version        # 9.12.1 (via Corepack)
echo $env:ANDROID_HOME  # path to your Android SDK
java -version         # JDK 17
```

You also need:

- Android SDK Platform 28+ (target 36) and Build-Tools 36.0.0 (install via Android Studio → SDK Manager).
- An Android device with USB debugging, or an emulator.
- A Google account (for the Drive backup feature).
- Project dependencies installed:

```powershell
corepack enable
cd <project-root>
pnpm install
```

### Windows build prerequisites (path length)

Windows caps a full path at 260 characters (`MAX_PATH`), and the NDK/CMake/ninja
toolchain enforces it even when the OS long-path flag is enabled. React Native's New
Architecture build puts long paths below the repo root — codegen C++ sources under
`node_modules` (~210 chars) and object files under `android/app/.cxx/...` (~246 chars,
even after CMake auto-shortens them). The object tree binds first, so **the repo root
must be at most ~10 characters** (e.g. `C:\pet`). A checkout under
`C:\Users\<you>\Documents\...` overflows and the native build fails with
`ninja: error: ... Filename longer than 260 characters`.

> **A `subst` virtual drive does _not_ help.** CMake canonicalizes the per-library
> paths back to the physical location, so the toolchain still sees the long path
> (verified: building from a `subst` drive reproduces the failure). You must
> **physically** relocate the checkout.

```powershell
git config --global core.longpaths true      # relax Git's own limit (deep pnpm paths)

# Move the checkout to a short root, reinstall deps, and clear stale native caches.
Move-Item "<project-root>" C:\pet
cd C:\pet
pnpm install
pnpm clean:android                            # removes android\app\.cxx + android\app\build (long-path safe)
```

The Gradle build fails fast with an actionable message (stating the exact maximum
length) if the repo path is still too long — see Troubleshooting.

> **Alternative if you need a longer repo path:** relocate only the native build
> output (the `.cxx` tree) to a short directory so the object paths no longer sit under
> the repo root. The repo can then live anywhere ≤ ~49 chars (the codegen-source
> limit), but the simplest reliable fix remains a short checkout root.

---

## Step 1: Environment configuration

Create your `.env` from the template and add the OAuth values (filled in Step 3):

```powershell
cd <project-root>
Copy-Item .env.example .env
notepad .env
```

```env
GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
```

`.env` is gitignored — never commit it. Variables are embedded in the APK at build time,
so changing `.env` requires a rebuild.

---

## Step 2: Generate a release keystore

```powershell
cd <project-root>\android\app

keytool -genkey -v -keystore expense-tracker-release.keystore `
  -alias expense-tracker -keyalg RSA -keysize 2048 -validity 10000
```

You will be prompted for a keystore password, a key password, and certificate details
(name, organisation, locality, two-letter country code).

> **⚠️ This keystore is irreplaceable.** If you lose it you cannot ship an update to the
> same app — you would have to republish under a new package name. Store the passwords in
> a password manager and back up the `.keystore` file to a secure location. `*.keystore`
> is gitignored; confirm it never appears in `git status`.

You will register this keystore's SHA-1 with the Google OAuth client in Step 3 — see
[Signing identity](#signing-identity-which-sha-1-to-register) for how to read it
(`pnpm signing:report`).

---

## Step 3: Configure Google OAuth

The Drive backup feature uses `@react-native-google-signin/google-signin`, which needs
**two** OAuth clients in the same project — an **Android** client for app identity and a
**Web application** client for the `webClientId`:

1. **Create a project** — [Google Cloud Console](https://console.cloud.google.com/) → new project, e.g. "Expense Tracker".
2. **Enable the Drive API** — APIs & Services → Library → search "Google Drive API" → Enable.
3. **Configure the consent screen** — OAuth consent screen → External → app name "Expense Tracker", your support/developer email → add scope `https://www.googleapis.com/auth/drive.file` → add your Google account as a test user. Status stays "Testing".
4. **Create the Android client(s)** — Credentials → Create credentials → OAuth client ID → application type **Android**. Debug and release install under **different** applicationIds, so each build type needs its own Android client in the same project (Google matches by package + SHA-1):
   - **Debug:** package `com.expensetracker.debug`, SHA-1 = the `debug` variant from [Signing identity](#signing-identity-which-sha-1-to-register).
   - **Release:** package `com.expensetracker`, SHA-1 = the `release` variant from [Signing identity](#signing-identity-which-sha-1-to-register).
5. **Create the Web application client** — Credentials → Create credentials → OAuth client ID → **Web application**. Copy its Client ID into `GOOGLE_WEB_CLIENT_ID` in `.env`.

There is no custom redirect URI — google-signin uses the native Credential flow. The app
must run on a device/emulator with **Google Play services** installed.

### Signing identity (which SHA-1 to register)

Google matches your build by **package name + signing-certificate SHA-1**. Debug builds carry an
`applicationIdSuffix '.debug'` (`android/app/build.gradle`), so debug and release install as
**separate apps** and each needs its **own** Android OAuth client. Register the package **and** the
SHA-1 of the keystore that actually signs the build you run:

| Build type                                 | OAuth package to register  | Keystore (alias / password)                                                                              | Read its SHA-1                                                                  |
| ------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Debug** (`pnpm android`)                 | `com.expensetracker.debug` | `android/app/debug.keystore` (committed) — `androiddebugkey` / `android`                                 | `pnpm signing:report` → variant `debug`                                         |
| **Release** (`pnpm build:android:release`) | `com.expensetracker`       | `android/app/expense-tracker-release.keystore` (Step 2; gitignored) — `expense-tracker` / your passwords | `pnpm signing:report` → variant `release` (needs the four `RELEASE_*` vars set) |

`pnpm signing:report` runs Gradle's `signingReport`, which reads the real `signingConfigs` and
prints each variant's `SHA1`/`SHA-256` — the authoritative source, so a registered value can never
drift from the keystore. (Manual equivalent: `keytool -list -v -keystore <path> -alias <alias>`.)

> The committed debug keystore's SHA-1 is the same for everyone who clones the repo:
> `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. The release SHA-1 is unique to the
> keystore you generate in Step 2 — read it with `pnpm signing:report`. Do **not** register a
> global `~/.android/debug.keystore`: this project uses the project-local `android/app/debug.keystore`.

---

## Step 4: Configure release signing

Release builds **require** all four variables below. If **any** are missing the build
**hard-fails** — there is no silent debug-keystore fallback (a debug-signed "release" is
rejected by the Play Store but still installable, which causes confusing failures). Debug
builds (`pnpm android`) do not need these. The values are read from the **process
environment only**, never from `.env`, so signing secrets never land on disk or in the bundle.

**Per session:**

```powershell
$env:RELEASE_STORE_FILE     = "./expense-tracker-release.keystore"
$env:RELEASE_STORE_PASSWORD = "YOUR_KEYSTORE_PASSWORD"
$env:RELEASE_KEY_ALIAS      = "expense-tracker"
$env:RELEASE_KEY_PASSWORD   = "YOUR_KEY_PASSWORD"
```

**Reusable (optional):** put the same four lines in `android/app/release-signing.env`
(add it to `.gitignore`) and load them before building:

```powershell
Get-Content android\app\release-signing.env | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}
```

> **CI note:** the `.github/workflows/release-build.yml` workflow exercises a signed
> `assembleRelease` (`workflow_dispatch` or a pushed `v*` tag). Set these four values plus
> `GOOGLE_WEB_CLIENT_ID` as repository **secrets** (the keystore as `RELEASE_KEYSTORE_BASE64`,
> a base64 of the file); the workflow decodes the keystore to a runner-only path and never
> writes the passwords to `.env`. When the secrets are absent (e.g. a fork), the build job
> skips instead of failing. It runs R8 by default and uploads `app-release.apk` and
> `mapping.txt` as artifacts (see [Step 5](#retaining-the-r8-mapping-file-deobfuscation)).

---

## Step 5: Build the release artifact

Release builds run **R8** (code shrinking + obfuscation) and **resource shrinking**
(`minifyEnabled` / `shrinkResources` in `android/app/build.gradle`). This makes the
first build slower and obfuscates native stack traces — keep the `mapping.txt`
described below.

Choose the artifact for your distribution channel:

- **Sideload → APK** (`pnpm build:android:release` → `assembleRelease`, **`arm64-v8a` only**)
- **All ABIs → APK** (`pnpm build:android:release:all` → every ABI; needed for x86 emulators or a universal sideload)
- **Play Store → App Bundle** (`pnpm build:android:bundle` → `bundleRelease`, all ABIs)

> `build:android:release` builds only `arm64-v8a` (matching CI) for a fast loop on a
> physical 64-bit device. Use `build:android:release:all` for a fat APK; bundles always
> contain every ABI.

```powershell
cd <project-root>

# Optional but recommended: gate on a green build first
pnpm validate          # lint + typecheck + tests

# Purge stale native caches first if you just changed dependencies, then build.
# Use pnpm clean:android — NOT `gradlew clean`, which re-runs CMake configure against
# the stale autolinking files and fails on New Arch (see Troubleshooting).
pnpm clean:android           # removes android/app/.cxx + android/app/build
pnpm build:android:release   # APK
# pnpm build:android:bundle  # .aab for the Play Store
```

The first build takes several minutes (Gradle downloads dependencies and compiles
everything). On success the artifact is at:

```
android/app/build/outputs/apk/release/app-release.apk        # APK
android/app/build/outputs/bundle/release/app-release.aab     # App Bundle
```

Verify the APK signature matches your keystore:

```powershell
jarsigner -verify -verbose -certs android\app\build\outputs\apk\release\app-release.apk
# Expect "jar verified." and your certificate's CN
```

> **App Bundle signing caveat.** When you upload an `.aab`, Google **re-signs** it via
> Play App Signing, so the installed app's signature differs from a locally-signed
> sideload APK. A Play build therefore **cannot install over** a sideloaded APK (and
> vice versa) — uninstall first. You must also register the **Play App Signing** SHA-1
> with your Google OAuth client (in addition to the upload/keystore SHA-1 from Step 3),
> or Drive sign-in fails on Play builds.

### Retaining the R8 mapping file (deobfuscation)

Each obfuscated build emits a `mapping.txt` that is the **only** way to read its native
crash traces:

```
android/app/build/outputs/mapping/release/mapping.txt
```

It lives under the gitignored `build/` tree, so it is **not** version-controlled.

- **Bump `versionCode`** (`android/app/build.gradle`) for every distributed build, then
  archive that build's `mapping.txt` keyed to its `versionCode`, alongside the keystore.
- A mapping only deobfuscates the exact build it came from — mismatched mappings yield
  garbage.
- Deobfuscate a trace with the Android SDK's `retrace` (or Android Studio → Build
  → Analyze Stack Trace) using the matching `mapping.txt`.
- **Play Store:** upload the build's `mapping.txt` to Play Console → _Deobfuscation
  files_ for automatic crash symbolication (no SDK required).

---

## Step 6: Install and test on a device

Enable **Developer options** (tap Build number 7×) and **USB debugging**, connect the
device, then:

```powershell
adb devices                 # confirm the device is listed
adb install android\app\build\outputs\apk\release\app-release.apk
# If install fails because an older copy exists:
#   adb uninstall com.expensetracker
```

Smoke test the critical paths on the device. **This is mandatory for release builds:**
R8 shrinks/obfuscates only the native layer and its failures surface _only_ here — the
Jest suite runs against JS and cannot catch them. Exercise every native-module path
below (each is a place R8 can strip a needed symbol): OAuth/Drive, SQLite, Keychain/
biometric, SAF export, and the offline queue. Also confirm icons and themed UI render
(resource shrinking can remove name-resolved resources).

1. App launches; pick a base currency.
2. Add, edit, and delete an expense; totals update correctly.
3. **Time of day** — a new entry prefills today's date and the current clock time, both in
   device-local terms (check near midnight if the device is not on UTC). Enter a time, clear
   it, and re-edit it; confirm same-day rows sort newest-first by time and that rows with no
   time still appear. Export, then re-import, and confirm the times survive the round trip.
4. Filter by date preset / custom range / category.
5. Manage categories (add a custom one, use it on an expense).
6. **Google Drive export** — Settings → sign in with Google → grant the `drive.file`
   consent → export → confirm a CSV appears in the "Expense Tracker Backups" folder.
7. **Offline queue** — disable network, add an expense, queue an export; re-enable network
   and confirm it auto-uploads.
8. **Biometric lock** (if supported) — enable it (this now requires setting an app PIN first),
   background the app past the configured auto-lock time, confirm the unlock prompt. Then fully
   kill the app and relaunch; confirm the unlock prompt appears on cold start, and that the
   device-credential (PIN/passcode) fallback unlocks if biometrics fail. Re-enroll a biometric
   (add a fingerprint/face), relaunch, and confirm the device-passcode path still unlocks (the
   credential must not hard-lock). Finally, with the gate enabled, simulate a settings-read
   failure and confirm the app still locks (fail-closed).

9. **Auto-lock presets** — for each of Immediately / 1 / 5 / 15 / 30, background the app for
   just under and just over the setting and confirm the lock fires only past it. Set **Never**
   and confirm idle never locks, **then kill and relaunch and confirm it still locks on cold
   start** — the presets govern background idle only.

10. **App PIN, throttling and lockout** — these paths run against real Keystore hardware and
    are only mocked in Jest, so they must be exercised on a device:
    - Enter three wrong PINs, then a fourth, and confirm a **visible, growing** wait appears.
    - Continue to ten and confirm the lockout, with a clearly longer wait than the throttle.
    - **Force-quit during the lockout and relaunch** — the wait must still be in force, not reset.
    - Confirm biometrics still unlock while the PIN is locked out.
    - Wait out the lockout and confirm it clears on its own.
    - In Settings → App PIN, enter a wrong current PIN repeatedly and confirm it is throttled
      **the same way as the unlock modal** — this path must not be an unthrottled guessing oracle.
    - Confirm dismissing the biometric prompt does **not** consume a PIN attempt.
    - Time an unlock and confirm the PIN check stays comfortably under a second.

11. **Upgrade path for an existing install** — install a build predating the PIN, enable the
    biometric lock, then upgrade. Confirm the biometric prompt comes **first**, and that
    cancelling it leaves the app locked with **no** set-a-PIN prompt and **no** "Turn the lock
    off" button on screen — either one before authentication is a bypass. Once biometrics unlock,
    confirm the set-a-PIN prompt appears **before anything else is reachable**, and that
    **declining it turns the app lock off** rather than leaving it on with no way in. Confirm too
    that no "Use PIN instead" is offered at the lock — there is no PIN to type — and that entering
    into a PIN field, if a regression puts one back, does not consume attempts.

12. **Hardware without a usable biometric** — on a device or emulator with **no biometric
    enrolled** (a PIN-only screen lock counts, as does no screen lock at all), confirm the lock
    **still switches on** once a PIN is set, that the unlock screen **opens on the PIN field**
    rather than prompting for biometrics, and that no "authentication cancelled" message appears.
    This is the case the PIN fallback exists for, so a regression here removes the feature for
    exactly the users who need it.

    **The load-bearing check: the lock must not open itself.** Background the app past the
    auto-lock time and confirm it stays locked until the PIN is entered. With no biometric
    enrolled, `react-native-keychain` stores the gate credential under a no-auth cipher and hands
    it back unchallenged, so a regression here shows up as the unlock screen appearing and then
    vanishing on its own — which reads as the lock working. Watch for
    `Selected storage: KeystoreAESGCM_NoAuth` in logcat alongside a successful unlock with no
    prompt; that combination is the bug. Then enrol a fingerprint and confirm the prompt returns.

### Reference device for the PIN check

Step 10's timing check needs the slowest hardware the app supports, since the key derivation
count is calibrated per device at enrolment and the floor is the part no user device exercises.
Use an **API 28 Google Play x86_64 emulator image** (not AOSP — see the Play-services note
below), installed from a `pnpm build:android:release:all` APK, which is the all-ABI build that
covers x86 emulators.

**What the emulator can and cannot check.** It validates the parts that are pure computation
and storage: the derived key, the calibrated iteration count against the 250 ms budget, and the
lockout counter surviving a restart. Measured on an API 28 x86_64 image, calibration settled at
roughly 110,000 iterations for a ~255 ms derive — just above the 100,000 floor, which is the
evidence that floor was set sensibly.

It **cannot** stand in for steps 8-11's on-screen flow. Emulator Keystore is software-only, so
the biometric credential — which requires `SECURE_HARDWARE` — cannot be created there, and any
step that starts "unlock with biometrics" is unreachable. The lock itself still switches on
PIN-only, so the PIN, throttle and lockout screens can be driven on an emulator; the biometric
half of each step still needs a physical device.

To capture logs if something misbehaves:

```powershell
adb logcat -s ReactNative:V ReactNativeJS:V > logs.txt
```

Native stack traces in release logs are obfuscated — run them through `retrace` with the
build's archived `mapping.txt` (see [Step 5](#retaining-the-r8-mapping-file-deobfuscation)).

---

## Schema migrations are forward-only

`runMigrations` applies pending migrations in ascending order and records each in
`schema_migrations`. There is no `down` step: **a release that ships a migration cannot
be rolled back on a device that has already run it.**

Several migrations in the current schema make that consequential:

| Version | Change                                                                                   | What an older APK does after it has run                                                                                                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **7**   | `expenses` renamed to `transactions`                                                     | Queries a table that no longer exists — every read fails at launch. Breaks loudly.                                                                                                                                                           |
| **8**   | `type` columns added to `transactions` and `categories`                                  | Inserts omit `type`, so the column default silently records new **income** as an expense. Breaks quietly, which is worse.                                                                                                                    |
| **9**   | nullable `time` column; `idx_transactions_date` replaced by `idx_transactions_date_time` | Nothing harmful. Inserts omit `time`, the column is nullable with no default, and the row simply carries no time. The index swap is invisible to an older build, whose date-only queries are still served by the composite's leading column. |

| **10** | `funds` table; every transaction gains a required `fund_id`; `type` widened to admit `transfer` | Reads still work — the v9 columns are all present. **Writes fail**: an older insert omits `fund_id`, which is `NOT NULL` with no default. Breaks loudly on the first save, and the fix is to reinstall the newer build or clear app data. |

| **11** | `transactions` rebuilt so a transfer must carry `counterpart_currency_code`; existing transfers are backfilled | Reads still work — the column set is unchanged from v10. **Transfer writes fail**: an older build omits the currency on a transfer, which the CHECK now refuses. Expenses and income are unaffected, so this breaks narrowly and loudly. |

| **12** | `transactions` gains `is_confirmed INTEGER NOT NULL DEFAULT 1`; every existing row is confirmed by the default | **Nothing harmful — the mildest entry in this table.** Reads still work; the v11 column set is a subset. Writes still work: an older insert omits `is_confirmed` and the default records the row as confirmed, which is also the right answer for a row entered by hand. |

Practical rules:

- Do not distribute a build containing a new migration to anyone you may need to roll
  back. Test the upgrade path first (see below).
- Verify an upgrade on a device holding **real data from the previous version**, not a
  fresh install. `migrations.test.ts` mocks SQLite rather than executing it, so the
  suite cannot exercise a migration against actual rows.
- After upgrading across v8, confirm existing rows read back as expenses and existing
  categories as `both`, and that re-importing a CSV exported by the _previous_ version
  still lands every row as an expense.
- After upgrading across v9, confirm pre-upgrade rows still list (they carry no time) and
  that a CSV exported by the _previous_ version — which has no `time` column — still
  imports, leaving every row without a time.
- After upgrading across v12, confirm pre-upgrade rows read back **confirmed** and that
  none of them appears under Home's **Needs attention** filter. The migration adds a
  column rather than rebuilding the table, so it carries none of the row-loss risk that
  earns v10 and v11 their numbered checks below.

A device that commits one migration and fails the next recovers on its own: the failure
propagates out of `openDatabase`, the app shows its normal load-error state, and only
the committed version is recorded — so the next launch retries the outstanding one.

---

## Pre-release manual checks

Three properties of the funds feature cannot be established by the test suite and
must be confirmed on a device before a release that carries schema v10 or v11.

**1. The pre-migration snapshot is written where it is expected.**
`src/database/snapshot.ts` reconstructs the database path as a sibling of
`RNFS.DocumentDirectoryPath`, because neither `react-native-fs` nor
`react-native-sqlite-storage` exposes it. Install a build carrying an older
schema, add a transaction, then install the v10 build and launch it. Expect a
copy of `expense_tracker.db` under the app's `pre-migration/` directory, and
expect it to disappear on the next clean launch.

**2. Migration v10 preserves rows on the device's own SQLite.**
`migrations.roundtrip.test.ts` runs the migration against Node's bundled SQLite,
which is far newer than the system SQLite on the minimum supported device (3.22
on API 28). It proves the migration's logic, not its compatibility with that
older engine — `ALTER TABLE ... RENAME TO` in particular changed semantics in
3.25. Install a v9 build, record several transactions including one in a
non-base currency, upgrade to v10, and confirm every transaction is still listed
and assigned to the **General** fund.

The same version gap constrains ordinary queries, not just migrations: **UPSERT
(`INSERT ... ON CONFLICT ... DO UPDATE`) arrived in SQLite 3.24 and is a syntax
error on API 28.** `settingsRepository.setSetting` and
`currencyFxRatesRepository.upsertCurrencyFxRate` therefore use `INSERT OR
REPLACE`, which is valid on 3.22 and safe for both tables because each supplies
every column and neither is referenced by a foreign key. Jest mocks SQLite and a
modern emulator image accepts both spellings, so **nothing in `pnpm validate`
catches a regression here** — it surfaces only as a failed write on an API 28/29
device. Do not "modernise" either statement back to an UPSERT.

**3. Migration v11 rebuilds `transactions` a second time, and its backfill must
not yield NULL.** The migration adds a CHECK requiring every transfer to carry
`counterpart_currency_code`, and fills the column for rows recorded before it was
required. The value is taken from the destination fund, then the `base_currency`
setting, then the transaction's own `currency_code` — the last of which is `NOT
NULL`, so the expression cannot fail. Because `runMigrations` runs inside
`openDatabase`, a migration that aborts leaves the app unable to launch at all,
and **the pre-migration snapshot has no automatic restore path**: recovering from
one means pulling the file off the device by hand. Install a v10 build, record a
transfer between two funds of different currencies, upgrade to v11, and confirm
the app launches and the transfer still reads back with both amounts.

## Distribution options

| Option                          | Audience          | Mechanism                                                                                                           | Updates                  |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Personal sideload** (default) | Just you          | Build an APK (`pnpm build:android:release`) and install it                                                          | Manual re-install        |
| **Internal testing**            | Up to 100 testers | Upload an `.aab` (`pnpm build:android:bundle`) to the Google Play Internal Testing track ($25 one-time console fee) | Automatic via Play Store |
| **Public release**              | Anyone            | Upload an `.aab` to the Google Play Production track                                                                | Automatic                |

> Play tracks require an **App Bundle**, which Google re-signs via Play App Signing — see the
> signing caveat in [Step 5](#step-5-build-the-release-artifact) before your first upload.

Public release additionally needs an app icon, screenshots, a store listing, a privacy
policy, and a content rating — out of scope for personal use.

---

## OAuth 2.0 Security

Drive auth uses `@react-native-google-signin/google-signin`, which performs Google sign-in
through Google Play services rather than a browser redirect. There is **no client secret**
embedded in the app: the Android OAuth client is bound to the app's package name and signing
certificate (SHA-1), and the `webClientId` (a Web application client) is used only to obtain
an ID token. Google issues a short-lived access token that the app sends as a Bearer token to
the Drive REST API.

`src/security/googleAuth.ts` requests only the `drive.file` scope, so the app can read and
write **only files it created** — never the user's wider Drive contents.

### Security best practices

- Never commit `.env`; keep `GOOGLE_WEB_CLIENT_ID` out of version control.
- Register both debug and release SHA-1 fingerprints on the Android OAuth client.
- Rotate the client if it leaks; create a new one and revoke the old.
- Keep the scope at `drive.file` (app-created files only), not full `drive` access.
- Importing CSVs from other apps needs no new Drive permission: files the app did not
  create are opened through the system file picker, not the Drive API.

---

## Build deprecation residuals (known, accepted)

The Android build emits deprecation warnings but still completes (`BUILD SUCCESSFUL`); none
are errors. The **one first-party deprecation** — `ReactNativeHost` / `DefaultReactNativeHost`
in `MainApplication.kt` — **has been resolved** by migrating to a `ReactHost`-only bootstrap (the
package-list `getDefaultReactHost` overload). Everything below now originates in code this project
does **not** own. Each is recorded with the condition that would let it be retired.

The 0.83 upgrade **cleared** the `react-native-gesture-handler` Kotlin deprecation outright and
roughly halved the `react-native-screens` warnings (bumped to the latest `4.25.x`).
"At latest" means the newest published version still uses the deprecated RN API internally —
no bump can clear it today.

| Warning                                                                                                         | Origin                                                                                                                                                                                                                                | Retire when                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-native-screens` deprecations (`LayoutShadowNode`, `UIManagerModule`, `ReactModuleInfo` ctor, …)          | `react-native-screens` internals — **already at latest `4.25.x`**                                                                                                                                                                     | The library ships a release that drops the deprecated RN APIs                                                                                                                    |
| `react-native-safe-area-context` deprecations (`UIManagerModule`, `LayoutShadowNode`)                           | `react-native-safe-area-context` internals — **already at latest `5.8.x`**                                                                                                                                                            | The library ships a release that drops the deprecated RN APIs                                                                                                                    |
| `onCatalystInstanceDestroy() [removal]`                                                                         | `@react-native-community/netinfo` — present at **every** version incl. latest `12.x`, so kept at `^11.x` (a `12.x` bump clears nothing here)                                                                                          | netinfo removes the deprecated lifecycle method upstream                                                                                                                         |
| `react-native-keychain` deprecations (`isInsideSecureHardware`, `setUserAuthenticationValidityDurationSeconds`) | `react-native-keychain` internals                                                                                                                                                                                                     | Kept at `^9.x`; a `10.x` bump changes the biometric-gate API surface and must pass the on-device biometric smoke (see below) before adoption                                     |
| Vector-icons `TurboReactPackage` deprecation (codegen)                                                          | `@react-native-vector-icons/material-design-icons` (react-native-paper's default icon set)                                                                                                                                            | Kept at `^12.x`; a `13.x` bump is a paper-coupled visual change and must pass on-device icon-render verification before adoption                                                 |
| Java "uses or overrides a deprecated API" notes                                                                 | `react-native-fs`, `react-native-saf-x`, `react-native-sqlite-storage` (all at latest)                                                                                                                                                | The maintainer ships a release that drops the deprecated API                                                                                                                     |
| Java "uses a deprecated API" note (`react-native-config`)                                                       | `react-native-config`                                                                                                                                                                                                                 | Pinned because of `patches/react-native-config.patch`; on any bump, re-roll the patch (`pnpm patch`) first                                                                       |
| `Setting the namespace via the package attribute … is no longer supported` (manifest)                           | AGP warning from several libs' `AndroidManifest.xml` (`react-native-keychain`, `-sqlite-storage`, `-fs`, `-safe-area-context`, `-saf-x`, `@react-native-community/netinfo`) — `package=` attribute we do not own                      | The library removes `package=` from its manifest (AGP already ignores the value; harmless today)                                                                                 |
| `dependency.platforms.ios.project is not allowed` (invalid RN config)                                           | **Resolved** — `patches/react-native-sqlite-storage@6.0.1.patch` drops the rejected iOS `project` key from the library's `react-native.config.js` (iOS still autolinks via the shipped podspec; the Android `sourceDir` is untouched) | On any `react-native-sqlite-storage` bump, re-roll the patch (`pnpm patch`) first; upstream is unmaintained at `6.0.1`                                                           |
| "Deprecated Gradle features … incompatible with Gradle 9.0"                                                     | Third-party libraries' Groovy `build.gradle` space-assignment DSL (`--warning-mode all` attributes each to `node_modules/<lib>/android/build.gradle`)                                                                                 | The Gradle wrapper is intentionally held at the RN-0.83 default (8.14.3); moving to Gradle 9 turns these into hard errors until every autolinked library migrates its DSL to `=` |

The on-device smoke that gates the keychain/vector-icons bumps is described in
`doc-temp/TEST_ON_PHONE_REMOTELY.md` (DB CRUD + migration, biometric cold-start gate,
OAuth → Drive export, CSV export/share).

> **First-party native code (`AppPinCrypto`).** The app PIN's key derivation and salt come from
> a TurboModule in `android/app/src/main/java/com/expensetracker/pincrypto/`, wrapping the
> platform's `SecretKeyFactory` and `SecureRandom` rather than a third-party crypto dependency —
> so there is **no library row above to track**, and no upstream release to wait on. The trade is
> that its failure modes are invisible to `pnpm validate`: a malformed codegen spec or a missing
> `codegenConfig` block in `package.json` fails the **Gradle** build while Jest stays green, and
> R8 stripping in a release build would surface only on device. Verify it with a real
> `pnpm build:android:release` plus smoke steps 10–11, never a debug build alone. It is also a
> TurboModule, so it inherits the bridgeless-only constraint noted for `MainApplication.kt` below.

> **`MainApplication.kt` bootstrap (first-party deprecation resolved).** `reactHost` is built from
> `PackageList(this).packages` via the `getDefaultReactHost` overload that takes a package list, so the
> app no longer references the deprecated `ReactNativeHost`. This is **off-template** (RN's New App
> template still ships the `DefaultReactNativeHost` path) and the overload is inherently bridgeless and
> Hermes-only — consistent with this app's fixed `newArchEnabled=true` / `hermesEnabled=true`, but it
> would **not** honor a flip of either flag. Because it changes app startup, it must pass the on-device
> smoke above (especially the biometric cold-start gate) before shipping; to revert, restore the
> template's dual `reactNativeHost` + `reactHost` shape.

### Benign build-log noise (not warnings)

Beyond the deprecations above, a release build prints several **non-error, non-deprecation**
lines. They are expected and need no action:

| Line                                                                         | Origin                                                                          | Why it is benign                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-- GLOB mismatch!` (during `externalNativeBuildClean*`)                     | RN-generated CMake re-globbing codegen dirs on `clean`                          | Cosmetic clean-time diff between the globbed file list and disk; the following build regenerates correctly. The _failure_ variant — a missing codegen dir — is different (see Troubleshooting). |
| `Unable to strip … libconceal.so … packaging them as they are`               | A prebuilt `.so` shipped by a transitive dependency                             | The stripper cannot process the prebuilt library, so it is packaged unstripped — no functional impact.                                                                                          |
| `No modules to process in combine-js-to-schema-cli` (keychain, vector-icons) | RN codegen scanning a library that ships no JS NativeComponent/TurboModule spec | Nothing to generate; expected for those libraries.                                                                                                                                              |
| `WARN the transform cache was reset` (Metro)                                 | Metro after a cache invalidation (e.g. following `pnpm clean:android`)          | Expected on a clean build; Metro rebuilds its cache.                                                                                                                                            |
| Performance-suite `console.log` timings (`src/__tests__/performance/*`)      | Intentional benchmark instrumentation (Load/Filter/Sort/CSV timings)            | These are `console.log`, **not** `console.warn`/`console.error` — deliberate micro-benchmark output (cf. JMH/tinybench), surfaced by Jest's `● Console` grouping.                               |

### Verifying project-owned code is warning-clean

Every residual above originates in `node_modules` or RN tooling. **Project-owned code — our
Gradle DSL, Kotlin, and JS/TS — is verified warning-free.** Reproduce:

```powershell
pnpm lint          # eslint --max-warnings=0  -> 0 warnings
pnpm typecheck     # tsc --noEmit             -> 0 errors
pnpm test          # 484 tests pass; only the console.log benchmarks above
cd android; .\gradlew clean --warning-mode all; cd ..   # the "Gradle 9.0" notices attribute only to node_modules/*/android/build.gradle
```

`pnpm validate` (`eslint --max-warnings=0` + `tsc` + tests) is the enforcement point that keeps
our JS/TS warning-free and is a required check in `.github/workflows/validate.yml`. Our own
`build.gradle` files use `name = value` assignment (already Gradle-10-ready) and must stay on
that form.

> **Deliberate non-actions.** To keep the signal honest the residuals are **not** suppressed:
> do **not** add `org.gradle.warning.mode` to `gradle.properties`, and do **not** enable a global
> `--warning-mode fail` / `allWarningsAsErrors` — both would fail the build on third-party warnings
> this project does not own. Suppressing them at the log level, bumping the Gradle wrapper solely
> to clear them, or patching a library only to remove a warning are all out of scope (see the
> wrapper-hold rationale in the table above).

---

## Troubleshooting

### Build fails: "SDK location not found"

```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "<your-android-sdk-path>", "User")
# Restart PowerShell
```

### Build fails: "Repository path '…' is too long for Windows MAX_PATH" (or `ninja: ... Filename longer than 260 characters`)

The repo is checked out too deep for the New Architecture native build. A `subst` drive
does not help (paths are canonicalized) — physically relocate the repo to a short root,
reinstall deps, and clear stale native caches. See
[Windows build prerequisites](#windows-build-prerequisites-path-length).

### Build fails: `add_subdirectory given source ... which is not an existing directory` (or `-- GLOB mismatch!` / `Cannot specify link libraries for target "react_codegen_..."`)

Stale native caches after a dependency change (e.g. a React Native upgrade). `pnpm install`
wipes a library's `android/build` codegen tree, but `android/app/.cxx/**/build.ninja` and the
generated `android/app/build/generated/autolinking/.../Android-autolinking.cmake` still point at
it, so the next CMake configure dies on the missing directory. This is exactly why **`gradlew
clean` makes it worse** — `clean` triggers `externalNativeBuildClean*`, which re-runs configure
before codegen regenerates.

```powershell
pnpm clean:android           # remove android/app/.cxx + android/app/build (NOT `gradlew clean`)
pnpm build:android:release   # (or assembleDebug) regenerates codegen + autolinking
```

### Build fails: "Release signing credentials are missing" (or `:app:validateSigningRelease` fails)

This is the **expected** hard-fail when a release build runs without all four signing
variables. Re-set them (partial configuration also fails) and rebuild — see
[Step 4](#step-4-configure-release-signing).

### Build fails: "Keystore file not found"

```powershell
ls android\app\expense-tracker-release.keystore   # regenerate (Step 2) or restore from backup if missing
```

### App crashes on launch

Usually a missing `.env`, an invalid client ID, or a corrupt local database. Capture logs
and, if needed, clear app data:

```powershell
adb logcat -s ReactNative:V ReactNativeJS:V > crash-logs.txt
adb shell pm clear com.expensetracker
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

### Troubleshooting Google Sign-In Issues

**`DEVELOPER_ERROR` / error `10`** (the account picker opens, then closes immediately
after you select an account)

- The running build's package + SHA-1 aren't registered on a matching **Android** OAuth client.
  Remember debug and release use **different** packages: debug is `com.expensetracker.debug`, release
  is `com.expensetracker`. Register each build's package + SHA-1 from
  [Signing identity](#signing-identity-which-sha-1-to-register) (`pnpm signing:report`) — use the
  project-local `android/app/debug.keystore`, not a global `~/.android/debug.keystore`.
- Verify `GOOGLE_WEB_CLIENT_ID` in `.env` is the **Web application** client ID (not the
  Android one). Rebuild after any `.env` change.

**`PLAY_SERVICES_NOT_AVAILABLE`**

- The device/emulator lacks Google Play services. Use a "Google Play" emulator image, not
  AOSP, or a physical device with Play services.

**`SIGN_IN_CANCELLED`**

- The user dismissed the account picker; not an error. Retry the sign-in.

**Access blocked / `invalid_request` at the consent screen**

- The signing-in account must be a **test user** on the OAuth consent screen while the app
  is in "Testing", and the `drive.file` scope must be requested.

### Additional resources

- [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [@react-native-google-signin/google-signin](https://github.com/react-native-google-signin/google-signin)
