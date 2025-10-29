# Personal Expense Tracker

> **An offline-first, secure expense tracking application for Android built with React Native and TypeScript**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.82-61dafb.svg)](https://reactnative.dev/)
[![Node](https://img.shields.io/badge/Node-22.19.0-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.12.1-f69220.svg)](https://pnpm.io/)
[![License](https://img.shields.io/badge/License-Personal%20Use-red.svg)]()

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Google OAuth Setup](#google-oauth-setup)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Building for Release](#building-for-release)
- [Project Structure](#project-structure)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## 🎯 Overview

Personal Expense Tracker is a **single-user, offline-first** mobile application for tracking daily expenses, managing spending history, and exporting financial data. Built with React Native for Android (API 28+), it prioritizes privacy, security, and functionality without requiring constant internet connectivity.

### Design Philosophy

- **Offline-First**: Full functionality without internet; network only needed for Google Drive export
- **Privacy-Focused**: All data stored locally on device with SQLite; no cloud sync or tracking
- **Security-Hardened**: OAuth 2.0 with PKCE, biometric authentication, encrypted token storage
- **Type-Safe**: Comprehensive TypeScript coverage with strict compilation
- **Production-Ready**: ESLint security rules, parameterized SQL queries, no dynamic code loading

---

## ✨ Key Features

### 💰 Expense Management
- **Full CRUD Operations**: Create, read, update, and delete expenses with comprehensive validation
- **Multi-Currency Support**: Track expenses in any ISO-4217 currency with manual FX rates
- **Base Currency Conversion**: Automatic conversion to your chosen base currency with preserved exchange rates
- **Category Organization**: Flexible categorization with 18 default categories (customizable)
- **Date Filtering**: Quick filters (Last 7/30 days, This month, All time) plus custom date ranges
- **Rich Metadata**: Add notes, select categories, and track precise amounts with proper rounding

### 📊 Data & Analytics
- **Real-Time Totals**: Running total in base currency with applied filters
- **Historical Tracking**: Browse complete expense history sorted by date (newest first)
- **CSV Export**: Full-fidelity exports (UTF-8 BOM, RFC 4180 compliant) for analysis in Excel/Google Sheets
- **Audit Trail**: Preserved FX rates and computed base amounts ensure stable, auditable totals

### ☁️ Google Drive Backup
- **One-Click Export**: Generate and upload CSV backups to Google Drive
- **Offline Queue**: Exports queued when offline, automatically uploaded when connection restored
- **Auto-Folder Management**: Creates "Expense Tracker Backups" folder with persistent folder ID
- **OAuth 2.0 with PKCE**: Secure authentication without embedded secrets (mobile-optimized)
- **Least-Privilege Access**: `drive.file` scope only (app-created files, not full Drive access)

### 🔒 Security & Privacy
- **Biometric App Lock**: Optional biometric/PIN gate after 5 minutes of inactivity
- **Secure Token Storage**: Android Keystore for OAuth tokens with device-encrypted storage
- **No Telemetry**: Zero analytics, crash reporting, or tracking in v1
- **Parameterized SQL**: All database queries use parameter binding (ESLint-enforced)
- **Secret Management**: Environment variables via `react-native-config`, never committed to VCS

### 🎨 User Experience
- **Material Design 3**: Modern, accessible UI with React Native Paper
- **Light/Dark Themes**: Automatic theme switching based on device settings
- **British Date Format**: DD/MM/YYYY display (ISO YYYY-MM-DD storage)
- **Smooth Performance**: Virtualized lists with optimized rendering for 10,000+ expenses
- **Responsive Validation**: Inline error messages with clear feedback

---

## 🏗️ Architecture

### Tech Stack

**Frontend (Mobile)**
- **Framework**: React Native 0.82.1 (Bare CLI workflow)
- **Language**: TypeScript 5.9.3 with strict mode
- **UI Library**: React Native Paper 5.14.5 (Material Design 3)
- **Navigation**: React Navigation 7 (Native Stack)
- **State Management**: React Context + useReducer (no Redux)

**Storage & Security**
- **Database**: SQLite 6.0.1 (`react-native-sqlite-storage`) with WAL mode
- **OAuth**: `react-native-app-auth` 8.0.3 (PKCE support)
- **Keychain**: `react-native-keychain` 9.2.0 (Android Keystore)
- **Storage Access**: `react-native-saf-x` 2.2.3 (Scoped Storage/SAF)

**Development Tools**
- **Package Manager**: pnpm 9.12.1 (via Corepack)
- **Node Version**: 22.19.0 (pinned with `.nvmrc`)
- **Linting**: ESLint 9.38 (flat config) with TypeScript, React, security plugins
- **Formatting**: Prettier 3.4.2
- **Testing**: Jest 29 with TypeScript support
- **Git Hooks**: Husky 9.1.4 + lint-staged

### Data Model

#### Tables

**`expenses`** (Primary entity)
```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  amount_native REAL NOT NULL CHECK (amount_native > 0),
  currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
  fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
  base_amount REAL NOT NULL CHECK (base_amount >= 0),
  date TEXT NOT NULL CHECK (LENGTH(date) = 10),  -- ISO YYYY-MM-DD
  category_id INTEGER NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
```

**`categories`** (Expense classification)
```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**`app_settings`** (Key-value configuration)
```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```
- `base_currency` - User's preferred currency (e.g., "USD", "GBP")
- `biometric_gate_enabled` - Boolean flag for biometric lock
- `drive_folder_id` - Google Drive backup folder ID
- `export_directory_uri` - Android SAF directory URI for local CSV exports

**`export_queue`** (Offline backup queue)
```sql
CREATE TABLE export_queue (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_uri TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','uploading','completed','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT NULL,
  uploaded_at TEXT NULL,
  drive_file_id TEXT NULL
);
```

### Architecture Patterns

- **Repository Pattern**: Database operations abstracted through repository classes (`expensesRepository`, `categoriesRepository`, `settingsRepository`, `exportQueueRepository`)
- **Context-Based State**: Global state managed via `AppContext` with reducer pattern
- **Memoized Selectors**: Derived state (filtered expenses, totals) computed with `useMemo` to prevent unnecessary re-renders
- **Migration System**: Transactional database migrations with version tracking (`schema_migrations` table)
- **Offline Queue**: Export operations queued locally, uploaded when network available

---

## 📦 Prerequisites

### Required Software

1. **Node.js 22.19.0** (pinned via `.nvmrc`)
   - Install via [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows) or [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux)
   - Run: `nvm install 22.19.0 && nvm use 22.19.0`

2. **pnpm 9.12.1** (managed via Corepack)
   - Node 22+ includes Corepack; enable with: `corepack enable`
   - pnpm version is auto-installed from `package.json` `packageManager` field

3. **Android Development Environment**
   - **Android SDK**: Platform 28+ (Android 9.0 Pie minimum), Platform 36 (target)
   - **Android SDK Build-Tools**: 36.0.0
   - **Java JDK**: Version 17 (LTS)
   - **Android NDK**: 27.1.12297006
   - Follow [React Native environment setup guide](https://reactnative.dev/docs/set-up-your-environment?platform=android) for detailed instructions

4. **Git** (for version control)

### Recommended Tools

- **Android Studio**: For emulator, SDK management, and debugging
- **Visual Studio Code**: With ESLint, Prettier, and TypeScript extensions
- **React Native Debugger**: For advanced debugging and Redux DevTools-like inspection

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Personal-Expense-Tracker/ExpenseTracker
```

### 2. Install Node Dependencies

```bash
# Enable Corepack (if not already enabled)
corepack enable

# Install dependencies with pnpm
pnpm install
```

This will:
- Install all npm packages (including React Native, TypeScript, ESLint, Jest)
- Set up Git hooks via Husky
- Apply patches from `patches/` directory

### 3. Configure Environment Variables

Create a `.env` file in the `ExpenseTracker/` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Google OAuth credentials (see [Google OAuth Setup](#google-oauth-setup)):

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
```

⚠️ **IMPORTANT**: Never commit `.env` to version control. It's already in `.gitignore`.

### 4. Start Metro Bundler

```bash
pnpm start
```

Keep this terminal open. Metro will rebuild JavaScript bundles when files change.

### 5. Run the App on Android

In a **new terminal**:

```bash
# Run on connected device or emulator
pnpm android
```

The app will build, install, and launch automatically.

---

## ⚙️ Environment Configuration

### `.env` File Structure

```env
# Google OAuth 2.0 Configuration
GOOGLE_OAUTH_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_OAUTH_REDIRECT_URI=com.expensetracker:/oauth2redirect/google
GOOGLE_DRIVE_UPLOAD_SCOPE=https://www.googleapis.com/auth/drive.file
```

### Environment Variable Usage

The app uses `react-native-config` to load environment variables at build time:

```typescript
import Config from 'react-native-config';

const clientId = Config.GOOGLE_OAUTH_CLIENT_ID;
```

**Important Notes:**
- Variables are embedded in the APK at build time
- Changing `.env` requires rebuilding the app
- Debug and release builds can use different `.env` files (configured in `android/app/build.gradle`)

---

## 🔑 Google OAuth Setup

To enable Google Drive backup functionality, you must create OAuth 2.0 credentials in Google Cloud Console.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Enter project name (e.g., "Expense Tracker")
4. Click **"Create"**

### Step 2: Enable Google Drive API

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Drive API"**
3. Click **"Enable"**

### Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Select application type: **"Android"**
4. **Package name**: `com.expensetracker`
5. **SHA-1 certificate fingerprint**: See below

### Step 4: Obtain SHA-1 Fingerprint

**For Debug Builds:**
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**For Release Builds:**
```bash
# First, generate a release keystore (if you don't have one)
keytool -genkey -v -keystore expense-tracker-release.keystore -alias expense-tracker -keyalg RSA -keysize 2048 -validity 10000

# Then, get the SHA-1 fingerprint
keytool -list -v -keystore expense-tracker-release.keystore -alias expense-tracker
```

Copy the **SHA-1** value and paste it into Google Cloud Console.

### Step 5: Copy Client ID

1. After creating the credential, you'll see a **Client ID** (format: `<hash>.apps.googleusercontent.com`)
2. Copy this value
3. Paste it into your `.env` file as `GOOGLE_OAUTH_CLIENT_ID`

### Step 6: Verify Configuration

1. Rebuild the app: `pnpm android` (or `pnpm build:android:release` for release)
2. Open the app and navigate to **Settings** → **Export to Google Drive**
3. Tap **"Sign in with Google"**
4. You should see the Google account picker and consent screen
5. Grant permission to access Drive files
6. The app will display your account info and "Connected" status

### Troubleshooting OAuth

See [BUILDING.md - Troubleshooting PKCE Issues](./BUILDING.md#troubleshooting-pkce-issues) for common OAuth errors and solutions.

---

## 💻 Development Workflow

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start Metro bundler (keep running during development) |
| `pnpm android` | Build and run Android app in debug mode |
| `pnpm test` | Run Jest test suites |
| `pnpm test:watch` | Run tests in watch mode (re-run on file changes) |
| `pnpm test:coverage` | Generate test coverage report |
| `pnpm lint` | Run ESLint to check code quality |
| `pnpm lint:fix` | Auto-fix ESLint issues where possible |
| `pnpm typecheck` | Run TypeScript compiler in check mode (no emit) |
| `pnpm format` | Format code with Prettier |
| `pnpm validate` | Run lint, typecheck, and tests (CI-style validation) |
| `pnpm build:android:release` | Build release APK (see [BUILDING.md](./BUILDING.md)) |

### Git Workflow

#### Branch Naming Convention

- **Features**: `feature/<short-description>` (e.g., `feature/add-budget-tracking`)
- **Bug Fixes**: `bugfix/<ticket-or-context>` (e.g., `bugfix/fix-date-validation`)
- **Chores**: `chore/<maintenance>` (e.g., `chore/update-dependencies`)
- **Documentation**: `docs/<area>` (e.g., `docs/improve-readme`)

#### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `perf`

**Examples:**
```
feat: add expense search functionality
fix: correct date validation for leap years
chore: update react-native to 0.82.1
docs: add OAuth troubleshooting section
test: add repository unit tests
```

### Pre-Commit Hooks (Husky + lint-staged)

When you commit, the following checks run automatically:

1. **ESLint**: Lints staged TypeScript/JavaScript files (fails on warnings or errors)
2. **Jest**: Runs tests related to staged files
3. **Prettier**: Formats staged files

To bypass hooks (not recommended):
```bash
git commit --no-verify
```

### Code Quality Standards

#### ESLint Rules (Enforced)

- **No dynamic imports**: `ImportExpression` AST nodes are forbidden (no code splitting)
- **No React.lazy**: Lazy loading disabled for predictable bundle behavior
- **No dynamic `require()`**: Only static imports allowed (except in config files)
- **Parameterized SQL**: Custom rule detects raw string concatenation in SQL queries
- **No secrets**: `eslint-plugin-no-secrets` scans for high-entropy strings (API keys, tokens)

#### TypeScript Strictness

- Extends `@react-native/typescript-config` (includes strict mode)
- All files must type-check with `tsc --noEmit`
- No `any` types unless explicitly justified

---

## 🧪 Testing

### Test Structure

Tests are co-located with source files in `__tests__/` directories:

```
src/
├── export/
│   ├── csvBuilder.ts
│   └── __tests__/
│       ├── csvBuilder.test.ts
│       └── export.integration.test.ts
├── utils/
│   ├── validation.ts
│   └── __tests__/
│       └── validation.test.ts
```

### Running Tests

```bash
# Run all tests once
pnpm test

# Watch mode (re-run on file changes)
pnpm test:watch

# Coverage report
pnpm test:coverage

# Run tests for specific file
pnpm test csvBuilder

# Run specific test suite
pnpm test --testNamePattern="should format CSV"
```

### Test Coverage Goals

- **Target**: >80% line coverage
- **Current**: ~20% (see [Priority Tasks](#priority-tasks) for coverage plan)

### Test Categories

1. **Unit Tests**: Pure functions (validation, formatting, math)
2. **Repository Tests**: Database operations (CRUD, queries)
3. **Integration Tests**: Multi-layer flows (CSV export, OAuth)
4. **Component Tests**: React component behavior (planned)

### Writing Tests

Example test structure:

```typescript
import { validateCurrencyCode } from '../validation';

describe('validateCurrencyCode', () => {
  it('should accept valid ISO-4217 codes', () => {
    const result = validateCurrencyCode('USD');
    expect(result.valid).toBe(true);
  });

  it('should reject invalid codes', () => {
    const result = validateCurrencyCode('INVALID');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('not a valid ISO-4217 currency code');
  });
});
```

---

## 📦 Building for Release

See **[BUILDING.md](./BUILDING.md)** for comprehensive instructions on:

- Generating release keystores
- Configuring signing credentials
- Building production APKs
- Installing on devices
- OAuth 2.0 PKCE setup and verification

### Quick Release Build

```bash
# Set release signing environment variables (see BUILDING.md)
export RELEASE_STORE_FILE=./expense-tracker-release.keystore
export RELEASE_STORE_PASSWORD=your-password
export RELEASE_KEY_ALIAS=expense-tracker
export RELEASE_KEY_PASSWORD=your-password

# Build release APK
pnpm build:android:release
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

---

## 📁 Project Structure

```
ExpenseTracker/
├── android/                    # Android native code
│   ├── app/
│   │   ├── build.gradle        # App-level Gradle config (signing, OAuth redirect)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── java/com/expensetracker/
│   └── build.gradle            # Project-level Gradle config (SDK versions)
├── src/
│   ├── components/             # Reusable UI components
│   │   ├── CategoryPickerDialog.tsx
│   │   └── CurrencyPickerDialog.tsx
│   ├── constants/              # Static data
│   │   ├── currencies.json     # ISO-4217 currency list
│   │   ├── currencyOptions.ts  # Currency picker data
│   │   └── defaultCategories.ts # Initial category seed
│   ├── context/                # React Context state management
│   │   └── AppContext.tsx      # Global app state (expenses, categories, settings)
│   ├── database/               # SQLite layer
│   │   ├── database.ts         # Database initialization, connection
│   │   ├── migrations.ts       # Schema migrations (v1-v4)
│   │   ├── seeding.ts          # Default data seeding
│   │   ├── repositories/       # Data access layer
│   │   │   ├── expensesRepository.ts
│   │   │   ├── categoriesRepository.ts
│   │   │   ├── settingsRepository.ts
│   │   │   └── exportQueueRepository.ts
│   │   └── __tests__/          # Database tests
│   ├── export/                 # CSV export and Drive upload
│   │   ├── csvBuilder.ts       # CSV generation (RFC 4180)
│   │   ├── driveUploader.ts    # Google Drive REST API client
│   │   ├── exportQueueManager.ts # Queue operations
│   │   └── __tests__/          # Export tests
│   ├── navigation/             # React Navigation
│   │   └── AppNavigator.tsx    # Stack navigator definition
│   ├── screens/                # Screen components
│   │   ├── HomeScreen.tsx      # Expense list + filters + totals
│   │   ├── AddExpenseScreen.tsx # Create/edit expense form
│   │   ├── SettingsScreen.tsx  # App settings
│   │   ├── ManageCategoriesScreen.tsx # Category CRUD
│   │   ├── ExportQueueScreen.tsx # Backup queue management
│   │   ├── homeUtils.ts        # Home screen helper functions
│   │   ├── expenseFormUtils.ts # Form validation and payload building
│   │   └── __tests__/          # Screen tests
│   ├── security/               # Authentication and storage
│   │   ├── googleAuth.ts       # OAuth 2.0 with PKCE
│   │   ├── AppLock.tsx         # Biometric lock modal
│   │   ├── storageAccess.ts    # Android SAF (Scoped Storage)
│   │   └── __tests__/          # Security tests
│   ├── theme/                  # Material Design theming
│   │   └── index.ts            # Light/dark theme definitions
│   ├── types/                  # TypeScript type definitions
│   │   ├── database.d.ts       # Database row types
│   │   ├── expense.d.ts        # Expense domain types
│   │   ├── json.d.ts           # JSON import declarations
│   │   └── react-native-saf-x.d.ts # SAF library types
│   ├── utils/                  # Utility functions
│   │   ├── validation.ts       # Input validation
│   │   ├── formatting.ts       # Money/date formatting
│   │   ├── date.ts             # Date utilities (British format)
│   │   ├── math.ts             # Banker's rounding
│   │   └── __tests__/          # Utility tests
│   └── App.tsx                 # Root component
├── .env                        # Environment variables (NOT IN VCS)
├── .env.example                # Environment template (committed)
├── .eslintrc.js                # ESLint flat config
├── .gitignore                  # Git ignore rules
├── .nvmrc                      # Node version (22.19.0)
├── .prettierrc.js              # Prettier config
├── babel.config.js             # Babel transformer
├── jest.config.js              # Jest test configuration
├── jest.setup.js               # Jest mock setup
├── metro.config.js             # Metro bundler config
├── package.json                # npm dependencies and scripts
├── pnpm-lock.yaml              # pnpm lockfile
├── tsconfig.json               # TypeScript configuration
├── BUILDING.md                 # Release build guide
└── README.md                   # This file
```

---

## 🔒 Security

### Threat Model

This app prioritizes **local security** (device protection) over **network security** (since it's offline-first).

**Protected Assets:**
1. **Expense data** (SQLite database)
2. **OAuth tokens** (Google Drive access)
3. **User privacy** (no telemetry, no tracking)

**Threat Vectors:**
1. **Physical device access** → Mitigated by biometric lock + Android device encryption
2. **APK reverse engineering** → Mitigated by no embedded secrets (OAuth PKCE, environment vars)
3. **SQL injection** → Mitigated by parameterized queries (ESLint-enforced)
4. **Token theft** → Mitigated by Android Keystore (hardware-backed encryption)
5. **Man-in-the-middle** → Mitigated by HTTPS-only APIs, certificate pinning (future enhancement)

### Security Features

#### 1. OAuth 2.0 with PKCE (Proof Key for Code Exchange)

**Why PKCE?**
- Mobile apps cannot securely store client secrets (APKs can be decompiled)
- PKCE replaces static secrets with dynamic, per-request code verifiers
- Google enforces PKCE for Android OAuth clients

**How it works:**
1. App generates random `code_verifier` (43-128 chars)
2. App computes `code_challenge = SHA256(code_verifier)` (base64-URL encoded)
3. Authorization request includes `code_challenge` + `code_challenge_method=S256`
4. User approves, Google returns authorization code
5. Token exchange includes original `code_verifier`
6. Google validates `SHA256(code_verifier) == code_challenge`, issues tokens

**Implementation:** `src/security/googleAuth.ts` sets `usePKCE: true` in `react-native-app-auth` config.

**Resources:**
- [RFC 7636: PKCE Specification](https://datatracker.ietf.org/doc/html/rfc7636)
- [Google OAuth for Mobile Apps](https://developers.google.com/identity/protocols/oauth2/native-app)

#### 2. Android Keystore (Secure Token Storage)

**Token Storage:**
- OAuth tokens stored via `react-native-keychain`
- Service name: `google-drive-auth`
- Accessibility: `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
- Security level: `SECURE_HARDWARE` (if available)

**Keystore Properties:**
- Hardware-backed encryption (on supported devices)
- Keys never leave Secure Element / Trusted Execution Environment (TEE)
- Auto-deleted on app uninstall

#### 3. Biometric App Lock

**Flow:**
1. User enables biometric lock in Settings
2. App tracks foreground/background state
3. After 5 minutes in background, app locks
4. User must authenticate with biometric/PIN to unlock
5. Modal blocks UI until authentication succeeds

**Implementation:** `src/security/AppLock.tsx` + `AppContext.tsx`

**Biometric Storage:**
- Service name: `expense-tracker-biometric-gate`
- Access control: `BIOMETRY_CURRENT_SET` (invalidates on new biometric enrollment)

#### 4. Parameterized SQL Queries

**Enforcement:**
- Custom ESLint rule detects `executeSql` calls with template literals or string concatenation
- All queries must use `?` placeholders and value arrays

**Example:**
```typescript
// ❌ WRONG (ESLint error)
db.executeSql(`SELECT * FROM expenses WHERE id = ${id}`);

// ✅ CORRECT
db.executeSql('SELECT * FROM expenses WHERE id = ?', [id]);
```

#### 5. Secret Detection

**ESLint Plugin:** `eslint-plugin-no-secrets`
- Scans code for high-entropy strings (potential API keys, tokens)
- Tolerance: 4 (flags strings with >4 shannon entropy)
- Fails CI build on detection

#### 6. No Dynamic Code Loading

**ESLint Rules:**
- Bans `ImportExpression` (dynamic `import()`)
- Bans `React.lazy` (code splitting)
- Bans `require()` with non-static strings

**Rationale:**
- Reduces attack surface (no remote code execution)
- Simplifies security audits (all code is static)
- Improves app startup time (no lazy loading overhead)

### Security Best Practices

1. **Never commit `.env`** - Use `.env.example` as a template
2. **Rotate OAuth credentials if exposed** - Revoke old client, create new one
3. **Use separate OAuth clients for debug/release** - Easier to revoke if debug keystore leaks
4. **Enable biometric lock** - Protects against physical device access
5. **Review ESLint security warnings** - Don't disable rules without justification
6. **Keep dependencies updated** - Run `pnpm update` regularly, check for CVEs
7. **Use release builds for sideloading** - Debug builds have relaxed security (e.g., cleartext traffic)

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Metro Bundler Errors

**Error:** `Unable to resolve module ...`

**Solution:**
```bash
# Clear Metro cache
pnpm start --reset-cache

# Clear watchman cache
watchman watch-del-all

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

---

#### 2. Android Build Failures

**Error:** `SDK location not found`

**Solution:**
- Set `ANDROID_HOME` environment variable:
  ```bash
  # Windows
  setx ANDROID_HOME "C:\Users\<YourUsername>\AppData\Local\Android\Sdk"

  # macOS/Linux
  export ANDROID_HOME=$HOME/Android/Sdk
  ```

**Error:** `Execution failed for task ':app:validateSigningRelease'`

**Solution:**
- Ensure release signing environment variables are set (see [BUILDING.md](./BUILDING.md))
- Or build debug APK instead: `pnpm android`

---

#### 3. OAuth Errors

**Error:** `DEVELOPER_ERROR` or `invalid_client`

**Solution:**
- Verify `GOOGLE_OAUTH_CLIENT_ID` in `.env` matches Google Cloud Console client ID
- Ensure OAuth client type is **"Android"** (not "Web")
- Check SHA-1 fingerprint is added to OAuth client
- Rebuild app after changing `.env`: `pnpm android`

**Error:** `Redirect URI mismatch`

**Solution:**
- Verify `GOOGLE_OAUTH_REDIRECT_URI` format: `com.expensetracker:/oauth2redirect/google`
- Check `android/app/build.gradle` correctly parses redirect URI
- Ensure `AndroidManifest.xml` has correct intent filter (should be auto-generated)

---

#### 4. Database Errors

**Error:** `no such table: expenses`

**Solution:**
- Database migrations may have failed
- Clear app data:
  ```bash
  adb shell pm clear com.expensetracker
  ```
- Reinstall app: `pnpm android`

**Error:** `UNIQUE constraint failed: categories.name`

**Solution:**
- Attempting to create duplicate category
- Check existing categories before insertion

---

#### 5. TypeScript Errors

**Error:** `Cannot find module ...` or type errors

**Solution:**
```bash
# Rebuild TypeScript
pnpm typecheck

# Restart TypeScript server in VSCode
# Press Ctrl+Shift+P → "TypeScript: Restart TS Server"

# Check tsconfig.json is correctly configured
```

---

#### 6. ESLint Errors

**Error:** `Potential secret found`

**Solution:**
- Move the value to `.env` and access via `react-native-config`
- If it's a false positive (e.g., test data), add `// eslint-disable-next-line no-secrets/no-secrets`

**Error:** `Import and export declarations are not supported yet`

**Solution:**
- Ensure file extension is `.ts` or `.tsx` (not `.js`)
- Check `babel.config.js` includes TypeScript preset

---

#### 7. Git Hook Failures

**Error:** `pnpm: command not found` in pre-commit hook

**Solution:**
```bash
# Enable Corepack globally
corepack enable

# Reinstall dependencies to refresh hooks
pnpm install
```

---

### Debug Tools

**React Native Debugger:**
```bash
# Enable remote JS debugging
# In app: Shake device → "Debug" → "Open Debugger"
```

**Android Logcat:**
```bash
# Filter logs for Expense Tracker
adb logcat | grep -i "expensetracker\|ReactNative"
```

**Database Inspection:**
```bash
# Pull database from device
adb pull /data/data/com.expensetracker/databases/expense_tracker.db

# Open with SQLite browser
sqlite3 expense_tracker.db
```

**Network Inspection:**
- Use Charles Proxy or mitmproxy to inspect HTTPS traffic (requires certificate installation)

---

## 📄 License

**Personal Use Only**

This project is for personal use and is not licensed for redistribution, commercial use, or modification by third parties. All rights reserved.

---

## 🙏 Acknowledgments

- [React Native](https://reactnative.dev/) - Cross-platform mobile framework
- [React Native Paper](https://callstack.github.io/react-native-paper/) - Material Design 3 components
- [React Navigation](https://reactnavigation.org/) - Routing and navigation
- [react-native-app-auth](https://github.com/FormidableLabs/react-native-app-auth) - OAuth PKCE implementation
- [Google Drive API](https://developers.google.com/drive) - Cloud backup functionality

---

## 📞 Support

For issues, questions, or feature requests, please open an issue in the repository's issue tracker.

**Useful Links:**
- [React Native Troubleshooting](https://reactnative.dev/docs/troubleshooting)
- [Android Developer Guides](https://developer.android.com/guide)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [React Native Paper Documentation](https://callstack.github.io/react-native-paper/)

---

**Built with ❤️ and TypeScript**
