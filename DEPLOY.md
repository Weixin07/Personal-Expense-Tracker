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

---

## Step 1: Environment configuration

Create your `.env` from the template and add the OAuth values (filled in Step 3):

```powershell
cd <project-root>
Copy-Item .env.example .env
notepad .env
```

```env
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
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

Get the SHA-1 fingerprint (needed for the Google OAuth client in Step 3):

```powershell
keytool -list -v -keystore expense-tracker-release.keystore -alias expense-tracker
```

Copy the `SHA1:` value from the output.

---

## Step 3: Configure Google OAuth

The Drive backup feature uses OAuth 2.0 with PKCE. Create an **Android** OAuth client:

1. **Create a project** — [Google Cloud Console](https://console.cloud.google.com/) → new project, e.g. "Expense Tracker".
2. **Enable the Drive API** — APIs & Services → Library → search "Google Drive API" → Enable.
3. **Configure the consent screen** — OAuth consent screen → External → app name "Expense Tracker", your support/developer email → add scope `https://www.googleapis.com/auth/drive.file` → add your Google account as a test user. Status stays "Testing".
4. **Create the credential** — Credentials → Create credentials → OAuth client ID:
   - Application type: **Android** (not Web or iOS).
   - Package name: `com.expensetracker`.
   - SHA-1 fingerprint: paste from Step 2 (add your **debug** SHA-1 too if you want Drive to work in debug builds — `~/.android/debug.keystore`, alias `androiddebugkey`, storepass/keypass `android`).
5. **Copy the Client ID** (`<hash>.apps.googleusercontent.com`) into `GOOGLE_OAUTH_CLIENT_ID` in `.env`.

Android OAuth clients support PKCE automatically — there is nothing to toggle. See
[OAuth 2.0 Security with PKCE](#oauth-20-security-with-pkce) for how it works and how to
verify it.

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

> **CI note:** a future release job must inject these as masked secrets — typically a
> base64-encoded keystore decoded at job start — never committed and never placed in `.env`.
> It must also run R8 (the release build does this by default) and retain each build's
> `mapping.txt` as an artifact keyed to `versionCode` (see [Step 5](#retaining-the-r8-mapping-file-deobfuscation)).

---

## Step 5: Build the release artifact

Release builds run **R8** (code shrinking + obfuscation) and **resource shrinking**
(`minifyEnabled` / `shrinkResources` in `android/app/build.gradle`). This makes the
first build slower and obfuscates native stack traces — keep the `mapping.txt`
described below.

Choose the artifact for your distribution channel:

- **Sideload → APK** (`pnpm build:android:release` → `assembleRelease`)
- **Play Store → App Bundle** (`pnpm build:android:bundle` → `bundleRelease`)

```powershell
cd <project-root>

# Optional but recommended: gate on a green build first
pnpm validate          # lint + typecheck + tests

# Clean, then build the artifact you need
cd android; .\gradlew clean; cd ..
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
3. Filter by date preset / custom range / category.
4. Manage categories (add a custom one, use it on an expense).
5. **Google Drive export** — Settings → sign in with Google → grant the `drive.file`
   consent → export → confirm a CSV appears in the "Expense Tracker Backups" folder.
6. **Offline queue** — disable network, add an expense, queue an export; re-enable network
   and confirm it auto-uploads.
7. **Biometric lock** (if supported) — enable it, background the app 5+ minutes, confirm
   the unlock prompt.

To capture logs if something misbehaves:

```powershell
adb logcat -s ReactNative:V ReactNativeJS:V > logs.txt
```

Native stack traces in release logs are obfuscated — run them through `retrace` with the
build's archived `mapping.txt` (see [Step 5](#retaining-the-r8-mapping-file-deobfuscation)).

---

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

## OAuth 2.0 Security with PKCE

**PKCE (Proof Key for Code Exchange)** extends the OAuth 2.0 authorization-code flow to
protect native apps from authorization-code interception. Mobile apps cannot hold a client
secret safely (APKs can be decompiled and every user shares the same binary), so PKCE
replaces the static secret with a per-request verifier/challenge pair.

How the app uses it:

1. Generate a random `code_verifier` (43–128 chars).
2. Compute `code_challenge = base64url(SHA256(code_verifier))`.
3. Send the authorization request with `code_challenge` and `code_challenge_method=S256`.
4. The user approves; Google returns an authorization code.
5. The token request includes the original `code_verifier`.
6. Google validates `SHA256(code_verifier) == code_challenge` and issues tokens.

Without the verifier (which never leaves the device until the token exchange), an
intercepted code is useless.

PKCE is enabled in `src/security/googleAuth.ts` via `usePKCE: true` in the
`react-native-app-auth` config; the library handles the flow automatically.

### Verifying PKCE is working

- **Logs:** `adb logcat | Select-String "pkce|code_challenge"` — expect `code_challenge`
  and `code_challenge_method=S256` in the authorization request.
- **Proxy:** inspect the request to
  `https://accounts.google.com/o/oauth2/v2/auth` with Charles/mitmproxy and confirm the
  same two parameters are present.

### Security best practices

- Never commit `.env`; keep `GOOGLE_OAUTH_CLIENT_ID` out of version control.
- Use separate OAuth clients for debug and release builds.
- Rotate the client if it leaks; create a new one and revoke the old.
- Keep the scope at `drive.file` (app-created files only), not full `drive` access.

---

## Troubleshooting

### Build fails: "SDK location not found"

```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "<your-android-sdk-path>", "User")
# Restart PowerShell
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

### Troubleshooting PKCE Issues

**"Invalid client"**

- `GOOGLE_OAUTH_CLIENT_ID` in `.env` must match the Google Cloud Console client.
- The client type must be **Android** (not Web or iOS).
- The SHA-1 fingerprint must be added to the client.

**"Redirect URI mismatch"**

- `GOOGLE_OAUTH_REDIRECT_URI` must be exactly `com.expensetracker:/oauth2redirect/google`.

**"Code verifier does not match challenge"**

- PKCE is working; this indicates flow tampering. Clear app data and re-authenticate.

**No `code_challenge` in the authorization request**

- Confirm `usePKCE: true` in `src/security/googleAuth.ts`.
- Confirm `react-native-app-auth` is 8.0.0+.
- Rebuild cleanly: `cd android; .\gradlew clean; cd ..; pnpm build:android:release`.

**`DEVELOPER_ERROR` / error `12501`**

- Verify the client ID, SHA-1, and that the package name is `com.expensetracker` in both
  `android/app/build.gradle` and the OAuth client. Rebuild after any `.env` change.

### Additional resources

- [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [RFC 7636: PKCE Specification](https://datatracker.ietf.org/doc/html/rfc7636)
- [react-native-app-auth](https://github.com/FormidableLabs/react-native-app-auth)
