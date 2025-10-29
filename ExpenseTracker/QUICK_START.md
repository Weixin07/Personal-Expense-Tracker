# Quick Start Guide - Production Build

> **⚡ Fast-track guide for experienced developers**
>
> For detailed instructions, see [PRODUCTION_READINESS_CHECKLIST.md](./PRODUCTION_READINESS_CHECKLIST.md)

---

## Prerequisites (5 min)

```powershell
# 1. Verify Node.js
node --version  # Should be v22.19.0

# 2. Enable Corepack & Install
corepack enable
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker
pnpm install

# 3. Verify Android SDK
echo $env:ANDROID_HOME  # Should be C:\Users\faith\AppData\Local\Android\Sdk
```

---

## Step 1: Environment Setup (5 min)

```powershell
# Create .env file
Copy-Item .env.example .env
notepad .env

# Add (we'll fill Google OAuth later):
# GOOGLE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
# GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
# GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
```

---

## Step 2: Generate Keystore (5 min)

```powershell
cd android\app

# Generate keystore
keytool -genkey -v -keystore expense-tracker-release.keystore -alias expense-tracker -keyalg RSA -keysize 2048 -validity 10000

# Get SHA-1 fingerprint
keytool -list -v -keystore expense-tracker-release.keystore -alias expense-tracker

# Copy the SHA-1 value (format: XX:XX:XX:XX:...)
```

**⚠️ Save keystore password and backup file!**

---

## Step 3: Google OAuth Setup (10 min)

### 3.1 Create Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project: "Expense Tracker"
3. Enable "Google Drive API"

### 3.2 OAuth Consent
1. OAuth consent screen → External
2. App name: "Expense Tracker"
3. Add scope: `https://www.googleapis.com/auth/drive.file`
4. Add test user: your email

### 3.3 Create Credentials
1. Credentials → Create OAuth client ID
2. Type: **Android**
3. Package: `com.expensetracker`
4. SHA-1: (paste from Step 2)
5. Copy Client ID

### 3.4 Update .env
```env
GOOGLE_OAUTH_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
```

---

## Step 4: Build Release APK (10 min)

```powershell
cd C:\Users\faith\Documents\Codes\Personal-Expense-Tracker\ExpenseTracker

# Set release signing vars
$env:RELEASE_STORE_FILE = "./expense-tracker-release.keystore"
$env:RELEASE_STORE_PASSWORD = "YOUR_PASSWORD"
$env:RELEASE_KEY_ALIAS = "expense-tracker"
$env:RELEASE_KEY_PASSWORD = "YOUR_PASSWORD"

# Build
pnpm build:android:release

# APK location:
# android\app\build\outputs\apk\release\app-release.apk
```

---

## Step 5: Install & Test (10 min)

```powershell
# Connect device via USB (enable USB debugging)
adb devices

# Install
cd android\app\build\outputs\apk\release
adb install app-release.apk
```

### Critical Tests:
1. ✅ App launches
2. ✅ Add expense works
3. ✅ Google Drive sign-in succeeds
4. ✅ Export to Drive uploads CSV
5. ✅ Check Google Drive for "Expense Tracker Backups" folder

---

## Common Issues

### Build fails with "SDK not found"
```powershell
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\Users\faith\AppData\Local\Android\Sdk", "User")
# Restart PowerShell
```

### Google OAuth shows "DEVELOPER_ERROR"
- Verify Client ID in `.env` matches Google Console
- Verify SHA-1 matches keystore
- Rebuild app after changing `.env`

### "redirect_uri_mismatch"
- Check `.env` has: `com.expensetracker:/oauth2redirect/google`
- Rebuild app

---

## Success Criteria ✅

- [ ] APK builds without errors
- [ ] App installs on device
- [ ] Core CRUD works (add/edit/delete expense)
- [ ] Google OAuth succeeds
- [ ] Export uploads to Google Drive
- [ ] CSV appears in Drive folder

**If all pass → Production ready! 🎉**

---

## Next Steps

**Personal Use:**
- Copy APK to phone whenever you need updates

**Wider Distribution:**
- Increase test coverage to 80% (see TEST_COVERAGE_REPORT.md)
- Create app icon & screenshots
- Submit to Google Play Internal Testing ($25 fee)

---

**Total Time:** ~45 minutes (first build)

**For detailed troubleshooting:** See PRODUCTION_READINESS_CHECKLIST.md
