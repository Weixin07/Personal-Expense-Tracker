# Production Readiness Checklist

> **Goal:** Prepare the Expense Tracker app for production deployment on Android

**Last Updated:** January 2025
**Estimated Time:** 2-3 hours (first-time setup)

---

## 📋 Pre-Flight Checklist

Before starting, ensure you have:

- [ ] Windows machine with administrator access
- [ ] Android device (Android 9.0+ / API 28+) with USB debugging enabled
- [ ] Google account for Google Cloud Console
- [ ] Stable internet connection
- [ ] 1-2 hours of uninterrupted time

---

## Step 1: Environment Setup ✅

### 1.1 Verify Node.js Installation

Open PowerShell/Command Prompt:

```powershell
# Check Node version (should be 22.19.0)
node --version

# If wrong version or not installed:
# 1. Download nvm-windows: https://github.com/coreybutler/nvm-windows/releases
# 2. Install nvm-windows-setup.exe
# 3. Open NEW PowerShell window:
nvm install 22.19.0
nvm use 22.19.0
```

**Expected Output:** `v22.19.0`

**Checklist:**
- [ ] Node.js 22.19.0 installed
- [ ] `node --version` returns correct version

---

### 1.2 Enable Corepack & Install Dependencies

```powershell
# Enable Corepack (manages pnpm)
corepack enable

# Navigate to project
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Install dependencies
pnpm install
```

**Expected Output:**
```
Progress: resolved XXX, reused XXX, downloaded 0, added XXX
Done in Xs
```

**Checklist:**
- [ ] Corepack enabled successfully
- [ ] `pnpm install` completed without errors
- [ ] `node_modules/` directory created

---

### 1.3 Verify Android SDK

```powershell
# Check ANDROID_HOME environment variable
echo $env:ANDROID_HOME

# Should point to: C:\Users\faith\AppData\Local\Android\Sdk
# If not set, add it:
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\faith\AppData\Local\Android\Sdk", "User")

# Restart PowerShell after setting
```

**Verify SDK Components:**

```powershell
# Check SDK platforms
ls $env:ANDROID_HOME\platforms

# Should see: android-28, android-36 (or higher)
```

**If SDK components missing:**
1. Open Android Studio
2. Tools → SDK Manager
3. Install:
   - Android SDK Platform 28 (minimum)
   - Android SDK Platform 36 (target)
   - Android SDK Build-Tools 36.0.0

**Checklist:**
- [ ] `ANDROID_HOME` environment variable set
- [ ] Android SDK Platform 28+ installed
- [ ] Android SDK Build-Tools 36.0.0 installed
- [ ] Java JDK 17 installed (verify with `java -version`)

---

### 1.4 Create `.env` File

```powershell
# Navigate to project root
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Create .env file from template
Copy-Item .env.example .env

# Open .env in your preferred editor
notepad .env
```

**Add these placeholders (we'll fill them in Step 4):**

```env
GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
```

**Checklist:**
- [ ] `.env` file created
- [ ] File contains all three required variables
- [ ] **IMPORTANT:** `.env` is in `.gitignore` (verify with `git status`)

---

## Step 2: Review Testing Roadmap 📊

### 2.1 Read TEST_COVERAGE_REPORT.md

```powershell
# Open the coverage report
code TEST_COVERAGE_REPORT.md

# Or use your preferred editor
notepad TEST_COVERAGE_REPORT.md
```

**Key Sections to Review:**

1. **Current Coverage Status** (Page 1)
   - Overall: 19.93% (target: 80%)
   - Utilities: 96.96% ✅
   - Core business logic: 0% ⚠️

2. **Roadmap to 80% Coverage** (Page 2-4)
   - Phase 1: Core Business Logic (+20%)
   - Phase 2: Integration Tests (+15%)
   - Phase 3: Component Tests (+25%)
   - Estimated effort: 10-15 days

3. **Testing Checklist** (Page 5)
   - Prioritized modules
   - Critical vs. nice-to-have

**Action Items:**

- [ ] Understand current coverage status
- [ ] Note that utility functions are 100% tested
- [ ] Acknowledge that AppContext, repositories, and screens need tests
- [ ] (Optional) Plan testing sprints if needed before production

**Decision Point:**

> **Question:** Do you want to increase test coverage to 80% before production release?
>
> - **Option A (Recommended):** Yes - Follow Phase 1-3 roadmap (10-15 days)
> - **Option B (Quick Release):** No - Deploy with current coverage, add tests iteratively

**My Recommendation:** For personal use, Option B is acceptable. For distribution, go with Option A.

**Checklist:**
- [ ] Read TEST_COVERAGE_REPORT.md
- [ ] Understand coverage gaps
- [ ] Decide on testing strategy (Option A or B)

---

## Step 3: Generate Release Keystore 🔑

### 3.1 Create Release Keystore

```powershell
# Navigate to android/app directory
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker\android\app

# Generate keystore (replace YOUR_NAME with your actual name)
keytool -genkey -v -keystore expense-tracker-release.keystore -alias expense-tracker -keyalg RSA -keysize 2048 -validity 10000

# You'll be prompted for:
# 1. Keystore password (choose a STRONG password, save it!)
# 2. Key password (can be same as keystore password)
# 3. First and last name
# 4. Organizational unit (can be "Personal")
# 5. Organization (can be your name)
# 6. City or Locality
# 7. State or Province
# 8. Two-letter country code (e.g., US, GB, etc.)

# Example interaction:
# Enter keystore password: MyStr0ngP@ssw0rd123!
# Re-enter new password: MyStr0ngP@ssw0rd123!
# What is your first and last name? [Unknown]: Faith Developer
# What is the name of your organizational unit? [Unknown]: Personal
# What is the name of your organization? [Unknown]: Faith
# What is the name of your City or Locality? [Unknown]: London
# What is the name of your State or Province? [Unknown]: England
# What is the two-letter country code for this unit? [Unknown]: GB
# Is CN=Faith Developer, OU=Personal, O=Faith, L=London, ST=England, C=GB correct? [no]: yes
```

**Verify Keystore Created:**

```powershell
# Check file exists
ls expense-tracker-release.keystore

# Should show file with size ~2-3 KB
```

**⚠️ CRITICAL SECURITY STEP:**

**Save your keystore details SECURELY:**

1. Create a password manager entry (e.g., LastPass, 1Password, KeePass)
2. Store:
   - Keystore password
   - Key alias: `expense-tracker`
   - Key password (if different from keystore password)
   - Path: `android/app/expense-tracker-release.keystore`

3. **Backup the keystore file:**
   ```powershell
   # Copy to secure location (external drive, encrypted cloud storage)
   Copy-Item expense-tracker-release.keystore D:\Backups\ExpenseTracker\
   ```

**⚠️ WARNING:** If you lose this keystore, you **cannot** update your app. You'll need to publish a new app with a different package name.

**Checklist:**
- [ ] Keystore generated successfully
- [ ] Keystore password saved in password manager
- [ ] Keystore file backed up to secure location
- [ ] `.gitignore` excludes `*.keystore` (verify: keystore should NOT appear in `git status`)

---

### 3.2 Get SHA-1 Fingerprint

```powershell
# Still in android/app directory
keytool -list -v -keystore expense-tracker-release.keystore -alias expense-tracker

# Enter keystore password when prompted
```

**Expected Output:**

```
Alias name: expense-tracker
Creation date: Jan 15, 2025
Entry type: PrivateKeyEntry
Certificate chain length: 1
Certificate[1]:
Owner: CN=Faith Developer, OU=Personal, O=Faith, L=London, ST=England, C=GB
Issuer: CN=Faith Developer, OU=Personal, O=Faith, L=London, ST=England, C=GB
Serial number: 12345678
Valid from: Wed Jan 15 10:00:00 GMT 2025 until: Sun Jun 02 10:00:00 GMT 2052
Certificate fingerprints:
     SHA1: A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0
     SHA256: ...
```

**Copy the SHA-1 value** (you'll need it for Google OAuth setup)

**Checklist:**
- [ ] SHA-1 fingerprint retrieved
- [ ] SHA-1 value copied to clipboard or saved to notepad

---

### 3.3 Set Environment Variables for Release Build

**Option A: Temporary (current session only)**

```powershell
# Set release signing variables
$env:RELEASE_STORE_FILE = "./expense-tracker-release.keystore"
$env:RELEASE_STORE_PASSWORD = "YOUR_KEYSTORE_PASSWORD"
$env:RELEASE_KEY_ALIAS = "expense-tracker"
$env:RELEASE_KEY_PASSWORD = "YOUR_KEY_PASSWORD"

# Verify
echo $env:RELEASE_STORE_FILE
```

**Option B: Permanent (recommended for repeated builds)**

Create a file: `android/app/release-signing.env`

```env
RELEASE_STORE_FILE=./expense-tracker-release.keystore
RELEASE_STORE_PASSWORD=YOUR_KEYSTORE_PASSWORD
RELEASE_KEY_ALIAS=expense-tracker
RELEASE_KEY_PASSWORD=YOUR_KEY_PASSWORD
```

**⚠️ IMPORTANT:** Add to `.gitignore`:

```powershell
# Navigate to project root
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Add to .gitignore
Add-Content android\app\.gitignore "release-signing.env"
```

**Load before building:**

```powershell
# Load environment variables from file
Get-Content android\app\release-signing.env | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}
```

**Checklist:**
- [ ] Release signing environment variables set
- [ ] Verified variables are loaded (`echo $env:RELEASE_STORE_FILE`)
- [ ] `release-signing.env` added to `.gitignore` (if using Option B)

---

## Step 4: Configure Google OAuth 🔑

### 4.1 Create Google Cloud Project

1. **Go to:** [Google Cloud Console](https://console.cloud.google.com/)

2. **Sign in** with your Google account

3. **Create New Project:**
   - Click dropdown at top-left (next to "Google Cloud")
   - Click **"NEW PROJECT"**
   - Project name: `Expense Tracker`
   - Organization: Leave as "No organization"
   - Click **"CREATE"**
   - Wait ~30 seconds for project creation

4. **Select the project:**
   - Click dropdown again
   - Select "Expense Tracker"
   - Verify project name appears in top bar

**Checklist:**
- [ ] Google Cloud project "Expense Tracker" created
- [ ] Project selected (visible in top bar)

---

### 4.2 Enable Google Drive API

1. **Navigate to APIs & Services:**
   - Left sidebar → **"APIs & Services"** → **"Library"**
   - Or use direct link: https://console.cloud.google.com/apis/library

2. **Search for Drive API:**
   - Search bar: type `Google Drive API`
   - Click on **"Google Drive API"** (by Google)

3. **Enable the API:**
   - Click **"ENABLE"** button
   - Wait ~10 seconds
   - You should see "API enabled" message

**Checklist:**
- [ ] Google Drive API enabled for project
- [ ] "Manage" button visible (indicates API is active)

---

### 4.3 Configure OAuth Consent Screen

1. **Navigate to OAuth consent screen:**
   - Left sidebar → **"OAuth consent screen"**
   - Or: https://console.cloud.google.com/apis/credentials/consent

2. **Choose User Type:**
   - Select **"External"**
   - Click **"CREATE"**

3. **Fill OAuth consent screen (Page 1):**
   - **App name:** `Expense Tracker`
   - **User support email:** (your email)
   - **App logo:** (optional - skip for now)
   - **App domain:** (leave blank)
   - **Authorized domains:** (leave blank)
   - **Developer contact information:** (your email)
   - Click **"SAVE AND CONTINUE"**

4. **Scopes (Page 2):**
   - Click **"ADD OR REMOVE SCOPES"**
   - Filter: type `drive.file`
   - Check: **"https://www.googleapis.com/auth/drive.file"**
   - Click **"UPDATE"**
   - Click **"SAVE AND CONTINUE"**

5. **Test users (Page 3):**
   - Click **"+ ADD USERS"**
   - Enter your Google account email
   - Click **"ADD"**
   - Click **"SAVE AND CONTINUE"**

6. **Summary (Page 4):**
   - Review settings
   - Click **"BACK TO DASHBOARD"**

**Checklist:**
- [ ] OAuth consent screen configured
- [ ] App name: "Expense Tracker"
- [ ] Scope `drive.file` added
- [ ] Your email added as test user
- [ ] Status: "Testing" (not published)

---

### 4.4 Create OAuth 2.0 Credentials (Android)

1. **Navigate to Credentials:**
   - Left sidebar → **"Credentials"**
   - Or: https://console.cloud.google.com/apis/credentials

2. **Create Credentials:**
   - Click **"+ CREATE CREDENTIALS"** (top)
   - Select **"OAuth client ID"**

3. **Configure OAuth Client:**
   - **Application type:** Select **"Android"**
   - **Name:** `Expense Tracker Android`
   - **Package name:** `com.expensetracker`
   - **SHA-1 certificate fingerprint:** Paste your SHA-1 from Step 3.2
     - Example: `A1:B2:C3:D4:E5:F6:G7:H8:I9:J0:K1:L2:M3:N4:O5:P6:Q7:R8:S9:T0`
   - Click **"CREATE"**

4. **Copy Client ID:**
   - A dialog will appear with your OAuth client details
   - **Copy the Client ID** (format: `123456789-abcdefg.apps.googleusercontent.com`)
   - Click **"OK"**

**⚠️ IMPORTANT:** Save this Client ID securely!

**Checklist:**
- [ ] OAuth 2.0 client ID created
- [ ] Application type: Android
- [ ] Package name: `com.expensetracker`
- [ ] SHA-1 fingerprint added
- [ ] Client ID copied

---

### 4.5 (Optional) Add Debug Keystore for Development

**Only needed if you want to test Google Drive in debug builds:**

1. **Get Debug SHA-1:**

```powershell
keytool -list -v -keystore C:\Users\faith\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android

# Copy the SHA-1 fingerprint
```

2. **Add Debug Client:**
   - Go back to **Credentials** page
   - Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
   - **Application type:** Android
   - **Name:** `Expense Tracker Android (Debug)`
   - **Package name:** `com.expensetracker`
   - **SHA-1 fingerprint:** (paste debug SHA-1)
   - Click **"CREATE"**

**Note:** Both debug and release clients will work with the same package name.

**Checklist:**
- [ ] (Optional) Debug OAuth client created
- [ ] Debug SHA-1 fingerprint added

---

### 4.6 Update `.env` File with Client ID

```powershell
# Navigate to project root
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Open .env
notepad .env
```

**Replace placeholder with your actual Client ID:**

```env
GOOGLE_OAUTH_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
```

**Save and close the file.**

**Verify:**

```powershell
# Check .env contents (without exposing full ID)
Get-Content .env | Select-String "GOOGLE_OAUTH_CLIENT_ID"

# Should show: GOOGLE_OAUTH_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

**Checklist:**
- [ ] `.env` file updated with real Client ID
- [ ] All three variables present
- [ ] File saved

---

## Step 5: Build Release APK 📦

### 5.1 Pre-Build Verification

```powershell
# Navigate to project root
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Verify environment
node --version        # Should be v22.19.0
pnpm --version        # Should be 9.12.1
echo $env:ANDROID_HOME  # Should be C:\Users\faith\AppData\Local\Android\Sdk

# Verify .env exists
ls .env

# Verify release keystore exists
ls android\app\expense-tracker-release.keystore

# Verify release signing env vars are set
echo $env:RELEASE_STORE_FILE
echo $env:RELEASE_KEY_ALIAS
```

**All checks should pass before proceeding.**

**Checklist:**
- [ ] Node.js 22.19.0 confirmed
- [ ] pnpm 9.12.1 confirmed
- [ ] ANDROID_HOME set correctly
- [ ] `.env` file exists
- [ ] Keystore file exists
- [ ] Release signing variables set

---

### 5.2 Run Type Check & Lint

```powershell
# Type check (should have no errors)
pnpm typecheck

# Lint (should have no errors or warnings)
pnpm lint
```

**If errors occur:**
- Fix TypeScript errors before building
- Fix or suppress ESLint warnings

**Checklist:**
- [ ] `pnpm typecheck` passes with 0 errors
- [ ] `pnpm lint` passes with 0 errors

---

### 5.3 Run Tests

```powershell
# Run all tests
pnpm test

# Should see:
# Test Suites: X passed, X total
# Tests: X passed, X total
```

**Expected:** Some test suites may fail (integration tests that depend on native modules). Core utility tests should pass.

**Checklist:**
- [ ] Core tests pass (formatting, date, math, validation, csvBuilder)
- [ ] No critical test failures

---

### 5.4 Build Release APK

```powershell
# Clean previous builds
cd android
.\gradlew clean
cd ..

# Build release APK (this takes 5-10 minutes first time)
pnpm build:android:release

# Or run directly:
# cd android
# .\gradlew assembleRelease
# cd ..
```

**Expected Output:**

```
> Task :app:packageRelease
> Task :app:assembleRelease

BUILD SUCCESSFUL in 5m 23s
142 actionable tasks: 142 executed
```

**Locate the APK:**

```powershell
# APK location
ls android\app\build\outputs\apk\release\app-release.apk

# Check file size (should be ~40-60 MB)
```

**Checklist:**
- [ ] Build completed successfully (`BUILD SUCCESSFUL`)
- [ ] `app-release.apk` file created
- [ ] File size is reasonable (40-60 MB)

---

### 5.5 Verify APK Signature

```powershell
# Verify APK is signed with your keystore
cd android\app\build\outputs\apk\release

# Check signature
jarsigner -verify -verbose -certs app-release.apk

# Should show:
# jar verified.
# X.509, CN=Faith Developer, OU=Personal, O=Faith, L=London, ST=England, C=GB
```

**Checklist:**
- [ ] APK signature verified
- [ ] Certificate matches your keystore details

---

## Step 6: Test on Physical Device 📱

### 6.1 Prepare Android Device

**Enable Developer Options:**

1. Go to **Settings** → **About phone**
2. Tap **Build number** 7 times
3. Enter device PIN/password
4. You should see "You are now a developer!"

**Enable USB Debugging:**

1. Go to **Settings** → **System** → **Developer options**
2. Toggle on **"USB debugging"**
3. Toggle on **"Install via USB"** (if available)

**Connect Device:**

1. Connect phone to PC via USB cable
2. On phone: tap **"Allow USB debugging"** when prompted
3. Check **"Always allow from this computer"**
4. Tap **"OK"**

**Verify Connection:**

```powershell
# Check device is detected
adb devices

# Should show:
# List of devices attached
# ABC123XYZ    device
```

**Checklist:**
- [ ] Developer options enabled
- [ ] USB debugging enabled
- [ ] Device connected via USB
- [ ] `adb devices` shows your device

---

### 6.2 Install APK on Device

```powershell
# Navigate to APK directory
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker\android\app\build\outputs\apk\release

# Install APK
adb install app-release.apk

# Should show:
# Performing Streamed Install
# Success
```

**If installation fails:**

```powershell
# Uninstall existing app first
adb uninstall com.expensetracker

# Then retry install
adb install app-release.apk
```

**Checklist:**
- [ ] APK installed successfully
- [ ] App icon visible on device home screen

---

### 6.3 Test Core Functionality

**Test Checklist (perform on device):**

#### 6.3.1 First Run Experience
- [ ] App launches without crashing
- [ ] Base currency selection screen appears
- [ ] Can select a base currency (e.g., USD, GBP)
- [ ] Transitions to main screen after selection

#### 6.3.2 Add Expense
- [ ] Tap "+" button (bottom-right)
- [ ] Enter description: "Test Expense"
- [ ] Enter amount: 50.00
- [ ] Select currency: USD (or your base currency)
- [ ] Enter FX rate: 1.0
- [ ] Base amount calculates correctly: 50.00
- [ ] Select date: today
- [ ] (Optional) Select category: "Food & Dining"
- [ ] (Optional) Add notes: "Test note"
- [ ] Tap "Save"
- [ ] Expense appears in list

#### 6.3.3 View & Filter Expenses
- [ ] Expense list shows added expense
- [ ] Total shows correct base amount
- [ ] Tap filter button (top-right)
- [ ] Change date range to "Last 7 days"
- [ ] Expense still visible (if added today)
- [ ] Change to "This month"
- [ ] Expense still visible
- [ ] Filter by category (if you selected one)
- [ ] Only expenses in that category show

#### 6.3.4 Edit Expense
- [ ] Tap on expense in list
- [ ] Edit screen opens with correct values
- [ ] Change amount to 75.00
- [ ] Base amount updates automatically
- [ ] Tap "Save"
- [ ] Updated expense shows in list
- [ ] Total updates correctly

#### 6.3.5 Delete Expense
- [ ] Tap on expense
- [ ] Tap "Delete" button
- [ ] Confirmation dialog appears
- [ ] Confirm deletion
- [ ] Expense removed from list
- [ ] Total updates to 0.00

#### 6.3.6 Categories Management
- [ ] Go to Settings (hamburger menu or settings icon)
- [ ] Tap "Manage Categories"
- [ ] See default categories (Food & Dining, Transportation, etc.)
- [ ] Tap "Add Category"
- [ ] Enter name: "Test Category"
- [ ] Save
- [ ] New category appears in list
- [ ] Go back to home
- [ ] Add new expense with "Test Category"
- [ ] Category appears in expense

#### 6.3.7 Google Drive Export (CRITICAL)
- [ ] Go to Settings
- [ ] Tap "Export to Google Drive"
- [ ] Tap "Sign in with Google"
- [ ] Google sign-in page opens in browser/WebView
- [ ] Sign in with your Google account
- [ ] Consent screen shows "Expense Tracker wants to:"
  - "See and download files created with this app from your Google Drive"
- [ ] Tap "Allow"
- [ ] Redirected back to app
- [ ] Settings shows "Connected as: your-email@gmail.com"
- [ ] Add at least one expense
- [ ] Go to Settings → "Export Backup"
- [ ] Export starts
- [ ] Shows "Export queued" or "Uploading..."
- [ ] After a few seconds, shows "Export completed"
- [ ] Check Google Drive in browser:
  - Folder: "Expense Tracker Backups"
  - File: `expenses_backup_YYYYMMDD_HHMMSS.csv`
- [ ] Download CSV and verify contents

#### 6.3.8 Offline Mode
- [ ] Turn off WiFi and mobile data on device
- [ ] Open app
- [ ] Add new expense
- [ ] Expense saves successfully
- [ ] Go to Settings → "Export Backup"
- [ ] Export queued (should show pending status)
- [ ] Turn on WiFi/data
- [ ] Wait ~10 seconds
- [ ] Export automatically uploads
- [ ] Check Google Drive for new file

#### 6.3.9 Biometric Lock (if supported)
- [ ] Go to Settings
- [ ] Toggle "Enable Biometric Lock"
- [ ] Authenticate with fingerprint/face
- [ ] Setting enabled
- [ ] Close app completely (swipe away from recents)
- [ ] Wait 5+ minutes
- [ ] Open app again
- [ ] Biometric prompt appears
- [ ] Authenticate to unlock

#### 6.3.10 Performance & Stability
- [ ] Add 50+ expenses (use a script if needed)
- [ ] Scroll through list smoothly (no lag)
- [ ] Filter by different date ranges
- [ ] Responses are fast (<1 second)
- [ ] App doesn't crash during heavy use
- [ ] Battery usage is reasonable (check Settings → Battery)

---

### 6.4 Test Error Scenarios

#### 6.4.1 Validation Errors
- [ ] Try to add expense with negative amount → Error message shown
- [ ] Try to add expense with empty description → Error message shown
- [ ] Try to add expense with invalid date format → Error message shown
- [ ] Try to add expense with date >3 days in future → Error message shown

#### 6.4.2 Network Errors
- [ ] Turn off internet
- [ ] Try to sign in to Google → Shows appropriate error
- [ ] Turn on internet
- [ ] Retry → Succeeds

#### 6.4.3 Permission Errors
- [ ] Revoke Google Drive access (Google Account settings → Security → Third-party apps)
- [ ] Try to export → Shows "Not authenticated" or similar
- [ ] Re-authenticate → Export succeeds

---

### 6.5 Collect Logs (if issues occur)

```powershell
# Capture real-time logs from device
adb logcat -s ReactNative:V ReactNativeJS:V ExpenseTracker:V

# Or save logs to file
adb logcat -s ReactNative:V ReactNativeJS:V > logs.txt

# Filter for errors
adb logcat *:E | Select-String "expensetracker"
```

**Checklist:**
- [ ] All core functionality tests passed
- [ ] Google Drive OAuth works
- [ ] Export/upload succeeds
- [ ] Offline mode works
- [ ] No critical crashes
- [ ] Performance acceptable

---

## 🎉 Production Ready!

If all checklists are complete, your app is ready for personal use!

### Final Deliverables

- [x] **Release APK:** `android/app/build/outputs/apk/release/app-release.apk`
- [x] **Keystore:** `android/app/expense-tracker-release.keystore` (backed up securely)
- [x] **Google OAuth Client:** Configured with correct SHA-1 and package name
- [x] **Documentation:** README.md, BUILDING.md, TEST_COVERAGE_REPORT.md complete

---

## 📦 Distribution Options

### Option 1: Personal Sideload (Current Setup)

**Who:** Just you
**How:** Copy APK to phone, install manually
**Updates:** Manual APK installation each time

**Steps:**
1. Copy `app-release.apk` to phone storage (e.g., via USB, Google Drive, email)
2. Open file manager on phone
3. Tap APK file
4. Tap "Install"
5. Done!

---

### Option 2: Internal Testing (Small Group)

**Who:** Up to 100 test users
**How:** Google Play Internal Testing track
**Updates:** Automatic via Play Store

**Setup:**
1. Create Google Play Console account ($25 one-time fee)
2. Create app listing
3. Upload APK to Internal Testing track
4. Add testers' email addresses
5. Share Play Store link with testers

**Pros:**
- Automatic updates
- No manual APK distribution
- Google Play Protect scanning

**Cons:**
- $25 fee
- Google Play Store review (1-2 days)

---

### Option 3: Public Release

**Who:** Anyone on Google Play Store
**How:** Google Play Production track
**Updates:** Automatic

**Requirements:**
- Polished app icon
- Screenshots (phone + tablet)
- Store listing (description, graphics)
- Privacy policy URL
- Content rating questionnaire
- 80%+ test coverage (recommended)
- Security audit

**Not Recommended Yet:**
- Test coverage is only 19.93%
- No privacy policy
- No app icon
- No screenshots

**Timeline to Public Release:**
- Testing: 2-3 weeks (Phase 1-3)
- Assets: 1 week (icon, screenshots, descriptions)
- Review: 3-7 days (Google Play review process)
- **Total: 1-2 months**

---

## 🔧 Troubleshooting

### Build Fails

**Error:** `SDK location not found`

**Fix:**
```powershell
$env:ANDROID_HOME = "C:\Users\faith\AppData\Local\Android\Sdk"
# Restart PowerShell
```

---

**Error:** `Execution failed for task ':app:validateSigningRelease'`

**Fix:**
```powershell
# Verify release signing env vars
echo $env:RELEASE_STORE_FILE
echo $env:RELEASE_STORE_PASSWORD
echo $env:RELEASE_KEY_ALIAS
echo $env:RELEASE_KEY_PASSWORD

# If any are empty, re-set them
```

---

**Error:** `Keystore file ... not found`

**Fix:**
```powershell
# Check keystore path
ls android\app\expense-tracker-release.keystore

# If missing, regenerate (Step 3.1) or restore from backup
```

---

### Google OAuth Fails

**Error:** `DEVELOPER_ERROR` or `12501` error code

**Fixes:**
1. Verify Client ID in `.env` matches Google Cloud Console
2. Verify SHA-1 fingerprint is correct (re-check Step 3.2)
3. Verify package name is `com.expensetracker` in both:
   - `android/app/build.gradle`
   - Google Cloud Console OAuth client
4. Try creating a new OAuth client with same settings
5. Rebuild app after changing `.env`: `pnpm build:android:release`

---

**Error:** `redirect_uri_mismatch`

**Fix:**
```powershell
# Verify redirect URI in .env
Get-Content .env | Select-String "REDIRECT_URI"

# Should be: com.expensetracker:/oauth2redirect/google
```

---

### App Crashes on Launch

**Steps:**
1. Capture logs:
   ```powershell
   adb logcat -s ReactNative:V ReactNativeJS:V > crash-logs.txt
   ```
2. Look for `FATAL EXCEPTION` or `Error:` messages
3. Common causes:
   - Missing `.env` file
   - Invalid Google Client ID
   - SQLite database corruption (clear app data)

**Quick fix:**
```powershell
# Clear app data
adb shell pm clear com.expensetracker

# Reinstall APK
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

---

## 📞 Support Resources

- **README.md:** Environment setup, architecture, troubleshooting
- **BUILDING.md:** OAuth PKCE details, release build process
- **TEST_COVERAGE_REPORT.md:** Testing roadmap and best practices
- **React Native Docs:** https://reactnative.dev/docs/troubleshooting
- **Google OAuth Docs:** https://developers.google.com/identity/protocols/oauth2/native-app

---

## ✅ Final Checklist

Before marking this production-ready, ensure:

- [ ] All environment setup steps completed
- [ ] Release keystore generated and backed up
- [ ] Google OAuth configured correctly
- [ ] Release APK built successfully
- [ ] APK tested on physical device
- [ ] All core features work (add, edit, delete, export)
- [ ] Google Drive export succeeds
- [ ] Offline mode works
- [ ] No critical crashes
- [ ] Performance is acceptable

**Congratulations! Your app is production-ready! 🎉**

---

**Generated:** January 2025
**Version:** 1.0.0
**For:** Personal Expense Tracker Android App
