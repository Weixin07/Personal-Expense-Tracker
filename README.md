# Personal Expense Tracker

> **An offline-first, secure expense tracking application for Android built with React Native and TypeScript**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React Native](https://img.shields.io/badge/React%20Native-0.83-61dafb.svg)](https://reactnative.dev/)
[![Node](https://img.shields.io/badge/Node-24.11.1-green.svg)](https://nodejs.org/)
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
- **Security-Hardened**: OAuth 2.0 with PKCE, biometric authentication with a PIN fallback, encrypted token storage
- **Type-Safe**: Comprehensive TypeScript coverage with strict compilation
- **Production-Ready**: ESLint security rules, parameterized SQL queries, no dynamic code loading

---

## ✨ Key Features

### 💰 Transaction Management

- **Full CRUD Operations**: Create, read, update, and delete transactions with comprehensive validation
- **Multi-Currency Support**: Record transactions in any ISO-4217 currency with manual FX rates
- **Base Currency Conversion**: Automatic conversion to your chosen base currency with preserved exchange rates
- **Category Organization**: Flexible categorization with 23 default categories (customizable), each usable for expenses, income, or both
- **Date Filtering**: Quick filters (Last 7/30 days, This month, All time) plus custom date ranges
- **Free-Text Search**: Search the description, payee and notes of your transactions from Home. Searching narrows the list alongside whatever period, type, category and fund filters are already set rather than replacing them, and the Reset control clears it with the rest. Matching ignores capitals for ordinary letters, and looks for what you typed as a whole — spacing included
- **Income and Expenses**: Record money in as well as out. Home summarises the filtered period as Spent, Received and Net, signed and grouped per base currency, with a transaction count for each direction. A search narrows these figures too, so the summary always describes the rows listed beneath it
- **Suggested Fills**: Tapping the description or payee field offers values from your own history for the type of transaction you are recording — an expense is never offered a payee you only ever used on income or a transfer. Values are ranked by how much you use them recently rather than alphabetically, and typing narrows the list. The recent window is the last 12 months, widened to 24 for transfers because they are rare enough that a shorter window leaves nothing to rank. The category and fund pickers are ordered the same way
- **Funds (Budget Pots)**: Set money aside in named pots — a travel budget, household savings — each denominated in one currency, with an opening balance. Every transaction belongs to one, and Home shows what is left in each as a single figure in that currency, over your whole history rather than the filtered period. A pot holding activity no saved rate can convert lists its figures separately, marked, rather than stating a total it cannot stand behind
- **Transfers Between Funds**: Move money between pots without it counting as spending or income. A cross-currency transfer records both what left and what arrived, so the rate it used is preserved rather than recomputed. A transfer conserves value: the destination is credited what the source gave up, so the amount recorded as arriving describes the transfer without feeding either balance — a transfer that lost a fee on the way reports no loss. The rate a cross-currency transfer used is remembered, so the next transfer between the same two currencies arrives with the amount received already filled in — a rate whose two amounts imply parity is queried before saving and is not remembered, so a figure entered twice by mistake cannot become the default. A transfer may also carry a description and payee of its own, shown on the Home row beside the two fund names
- **Rich Metadata**: Add notes, select categories, and track precise amounts with proper rounding

### 📊 Data & Analytics

- **Real-Time Totals**: Period summary in base currency, recomputed as filters change
- **Historical Tracking**: Browse complete transaction history sorted by date (newest first)
- **CSV Export**: Full-fidelity exports (UTF-8 BOM, RFC 4180 compliant) for analysis in Excel/Google Sheets
- **CSV Import**: Load transactions from a CSV file (local, Google Drive, or any other provider the system file picker exposes) or from a Drive backup this app exported, with column mapping and a review-before-commit preview
- **Flexible Import**: Reads CSVs written by other apps — auto-detects the column separator (comma/semicolon/tab) and common header names, normalises decorated amounts (`$1,234.56`, `1.234,56`, `(50.00)`), resolves currency symbols and names to ISO codes, and accepts ISO, month-name, and two-digit-year dates. A default currency covers files with no currency column. Direction comes from a mapped type column, or from the file's own negative-amount convention, which you declare in the review step
- **Import FX Confirmation**: When a file carries no exchange rate for a currency, the review step lists each currency pair and the rows waiting on it. Enter the rates, apply them, and the held rows join the import; rates left blank simply stay behind and are reported. A rate you saved earlier is filled in for you, named with the date you saved it and the rows counted at it — clearing that field rejects it, and holds those rows back rather than converting them at a rate you did not confirm. A confirmed rate is checked against the last one used — or against parity, when none is known — and is saved as the current rate for later manual entry, which the review step names before the import and the summary repeats after it
- **Import Converted Amounts**: A file that records its own converted total can be imported without supplying a rate — map that column to **Base amount** and each row keeps the conversion the source recorded, with the implied rate stored alongside it. A rate column in the file still takes precedence, and a rate reconstructed this way is treated as history rather than saved for later entry. Column names are not guessed here: a heading such as `INR` is as often the original amount as the converted one, so map it yourself — the field names your base currency to say which one it expects, and a reconstructed rate that does not look like a conversion (parity between two different currencies, or an order of magnitude away from a rate you have saved) is named in the review step and queried before the import runs
- **Import Review Decisions**: The review step separates what blocks the import from what merely needs a look. Multi-currency files are held until a base currency is set in Settings, since without one every amount would be stored at face value. Populated columns that no field claims are named with a sample value before anything is discarded, rows matching a stored transaction or an earlier row in the file are skipped unless you say otherwise, category names close to ones you already have (`Transportation` against `Transport`) are offered for merging, and any category the import would widen to cover both directions is listed first
- **Audit Trail**: Preserved FX rates and computed base amounts ensure stable, auditable totals

### ☁️ Google Drive Backup

- **One-Click Export**: Generate and upload CSV backups to Google Drive
- **Offline Queue**: Exports queued when offline, automatically uploaded when connection restored
- **Auto-Folder Management**: Creates "Expense Tracker Backups" folder with persistent folder ID
- **OAuth 2.0 with PKCE**: Secure authentication without embedded secrets (mobile-optimized)
- **Least-Privilege Access**: `drive.file` scope only (app-created files, not full Drive access). The in-app Drive list therefore shows only backups this app exported; a CSV you placed in Drive yourself is imported through the system file picker, which needs no extra Drive permission

### 🔒 Security & Privacy

- **App Lock**: Optional biometric gate with an app-PIN fallback, on relaunch and after a configurable idle period (Immediately / 1 / 5 / 15 / 30 minutes / Never, defaulting to 5)
- **Secure Token Storage**: Android Keystore for OAuth tokens with device-encrypted storage
- **No Telemetry**: Zero analytics, crash reporting, or tracking in v1
- **Parameterized SQL**: All database queries use parameter binding (ESLint-enforced)
- **Secret Management**: Environment variables via `react-native-config`, never committed to VCS

### 🎨 User Experience

- **Material Design 3**: Modern, accessible UI with React Native Paper
- **Light/Dark Themes**: Automatic theme switching based on device settings
- **British Date Format**: DD/MM/YYYY display (ISO YYYY-MM-DD storage), with an optional 24-hour `HH:MM` time stored as naive local wall-clock — never converted between timezones
- **Smooth Performance**: Virtualized lists with optimized rendering for 10,000+ expenses
- **Responsive Validation**: Inline error messages with clear feedback

---

## 🏗️ Architecture

### Tech Stack

**Frontend (Mobile)**

- **Framework**: React Native 0.83.10 (Bare CLI workflow)
- **Language**: TypeScript 5.9.3 with strict mode
- **UI Library**: React Native Paper 5.14.5 (Material Design 3)
- **Navigation**: React Navigation 7 (Native Stack)
- **State Management**: React Context + useReducer (no Redux)

**Storage & Security**

- **Database**: SQLite 6.0.1 (`react-native-sqlite-storage`) with WAL mode
- **OAuth**: `@react-native-google-signin/google-signin` (native Google sign-in)
- **Keychain**: `react-native-keychain` 9.2.0 (Android Keystore)
- **Storage Access**: `react-native-saf-x` 2.2.3 (Scoped Storage/SAF)

**Development Tools**

- **Package Manager**: pnpm 9.12.1 (via Corepack)
- **Node Version**: 24.11.1 (pinned with `.nvmrc`)
- **Linting**: ESLint 9.38 (flat config) with TypeScript, React, security plugins
- **Formatting**: Prettier 3.6.2
- **Testing**: Jest 30 with TypeScript support
- **Git Hooks**: Husky 9.1.4 + lint-staged

### Data Model

#### Tables

**`transactions`** (Primary entity)

```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income','transfer')),
  description TEXT NOT NULL,
  payee TEXT NOT NULL DEFAULT 'Unknown',
  amount_native REAL NOT NULL CHECK (amount_native > 0),
  currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
  fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
  base_amount REAL NOT NULL CHECK (base_amount >= 0),
  base_currency_code TEXT NULL,  -- base currency the rate/base_amount were captured against
  date TEXT NOT NULL CHECK (LENGTH(date) = 10),  -- ISO YYYY-MM-DD
  time TEXT NULL CHECK (time IS NULL OR LENGTH(time) = 5),  -- HH:MM, NULL = not recorded
  category_id INTEGER NULL,
  fund_id INTEGER NOT NULL,  -- the pot this belongs to; for a transfer, the source
  counterpart_fund_id INTEGER NULL,  -- destination of a transfer, else NULL
  counterpart_amount REAL NULL,  -- what arrived, in counterpart_currency_code
  counterpart_currency_code TEXT NULL,  -- what counterpart_amount is denominated in; required on a transfer
  notes TEXT NULL,
  is_confirmed INTEGER NOT NULL DEFAULT 1 CHECK (is_confirmed IN (0,1)),  -- 1 = the user has checked this row; imports arrive 0
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (  -- the three counterpart columns are present together, and only on a transfer
    (type = 'transfer'
      AND counterpart_fund_id IS NOT NULL
      AND counterpart_amount IS NOT NULL
      AND counterpart_currency_code IS NOT NULL
      AND counterpart_fund_id <> fund_id)
    OR
    (type <> 'transfer'
      AND counterpart_fund_id IS NULL
      AND counterpart_amount IS NULL
      AND counterpart_currency_code IS NULL)
  ),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
  FOREIGN KEY (counterpart_fund_id) REFERENCES funds(id) ON DELETE RESTRICT
);
```

A `transfer` moves money between two funds and is neither spending nor income:
it is excluded from every summary figure. A transfer conserves value: the single
`base_amount` leaves the source fund and that same figure reaches the
destination. `counterpart_amount` — what the user observed arriving — records
what the transfer looked like without feeding either balance, so a transfer that
lost a fee on the way reports no loss.

The rate a cross-currency transfer used is implied by `counterpart_amount`
against `amount_native` rather than stored. Where the two currencies differ that
figure is entered or converted from a saved rate, never copied from the source:
copying it would assert a rate of 1 between two currencies that are not worth
the same.

Each transaction records the base currency its `fx_rate_to_base`/`base_amount`
were captured against. Changing the `base_currency` setting applies to **new
transactions only**; existing rows keep their original base, and totals are
reported per base currency when historical data spans more than one.

`amount_native` is always a positive magnitude — direction is carried by
`type`, never by the sign of the amount.

`is_confirmed` records whether you have checked a row against reality. It is
separate from whether the app _suspects_ a row: that is recomputed from the
amounts each time, this is stored because only you can set it. Rows you enter
are confirmed; imported rows arrive unconfirmed, giving an import its own review
queue. The flag is not one of the 17 CSV columns, so a row exported and imported
again comes back unconfirmed.

**`categories`** (Transaction classification)

```sql
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('expense','income','both')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

A category is offered for a transaction when its `type` matches the direction
or is `both`. Categories that predate typing migrate to `both`, so nothing a
user was already filing under stops being available.

**`funds`** (Budget pots)

```sql
CREATE TABLE funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (LENGTH(name) > 0),
  currency_code TEXT NULL CHECK (currency_code IS NULL OR LENGTH(currency_code) = 3),
  opening_balance REAL NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

A fund is a pot money is set aside in — a travel budget, household savings. Every
transaction belongs to exactly one; a "General" fund is seeded and every existing
transaction is assigned to it on upgrade. A `NULL` `currency_code` means the fund
follows the configured base currency. Balances span the whole history regardless
of the date filter, and are reported as one figure in the fund's own currency:
each transaction contributes the `base_amount` recorded against it, and the
subtotals are converted at the latest cached rate. A fund whose own currency is
the base currency needs no rate at all. Where one subtotal has no rate to convert
it — a currency never yet exchanged, or rows saved before a base currency was
chosen — the fund reports every subtotal unconverted rather than some of them,
so a figure is never half-translated. A fund is denominated in exactly one
currency, whereas the Spent/Received/Net summary keeps its per-base-currency
groups: a total spanning funds has no single currency to claim. Deleting a fund
still referenced by any transaction is refused by the database.

**`app_settings`** (Key-value configuration)

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

- `base_currency` - User's preferred currency (e.g., "USD", "GBP")
- `biometric_gate_enabled` - Boolean flag for the app lock (biometrics and PIN together)
- `auto_lock_minutes` - Background idle before locking: `0`, `1`, `5`, `15`, `30`, or `never` (absent means 5)
- `app_pin_version` - Marks an install as having been offered a PIN. **The PIN itself is never stored here** — it lives in Keystore
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

**`currency_fx_rates`** (Last-used FX rate per currency)

```sql
CREATE TABLE currency_fx_rates (
  base_currency_code TEXT NOT NULL CHECK (LENGTH(base_currency_code) = 3),
  currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
  fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (base_currency_code, currency_code)
);
```

Caches the most recently entered rate for each `(base, currency)` pair so the
Add Transaction form can prefill it instead of requiring re-entry. A
cross-currency transfer contributes two: the currency it left in, and the
currency it arrived in, the latter implied by the amount received against the
base amount. A transaction already in the base currency contributes none, since
a currency is always worth one of itself.

The `counterpart_fund_id` index is partial (`WHERE counterpart_fund_id IS NOT
NULL`): the column is NULL on every non-transfer row, so a full index would
carry an entry per row to serve a small minority of them.

### Architecture Patterns

- **Repository Pattern**: Database operations abstracted through repository classes (`transactionsRepository`, `categoriesRepository`, `settingsRepository`, `exportQueueRepository`)
- **Context-Based State**: Global state managed via `AppContext` with reducer pattern
- **Memoized Selectors**: Derived state (filtered transactions, totals) computed with `useMemo` to prevent unnecessary re-renders
- **Migration System**: Transactional database migrations with version tracking (`schema_migrations` table)
- **Offline Queue**: Export operations queued locally, uploaded when network available

---

## 📦 Prerequisites

### Required Software

1. **Node.js 24.11.1** (pinned via `.nvmrc`)
   - Install via [nvm-windows](https://github.com/coreybutler/nvm-windows) (Windows) or [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux)
   - Run: `nvm install 24.11.1 && nvm use 24.11.1`

2. **pnpm 9.12.1** (managed via Corepack)
   - Node 24+ includes Corepack; enable with: `corepack enable`
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
cd PET
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

Create a `.env` file in the repository root:

```bash
cp .env.example .env
```

Edit `.env` and add your Google OAuth Web client ID (see [Google OAuth Setup](#google-oauth-setup)):

```env
GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
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
# Google Sign-In configuration (google-signin webClientId)
GOOGLE_WEB_CLIENT_ID=<your-web-client-id>.apps.googleusercontent.com
```

### Environment Variable Usage

The app uses `react-native-config` to load environment variables at build time:

```typescript
import Config from 'react-native-config';

const webClientId = Config.GOOGLE_WEB_CLIENT_ID;
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

Drive access uses `@react-native-google-signin/google-signin`, which needs **two** OAuth clients in the same project:

**a. Android client(s)** (app identity — no client secret, no redirect URI). Debug and release
install under different applicationIds, so create **one Android client per build type** in the same
project:

1. Go to **"APIs & Services"** → **"Credentials"** → **"Create Credentials"** → **"OAuth client ID"** → application type **"Android"**
2. **Debug client** — Package name `com.expensetracker.debug`, SHA-1 = the `debug` variant from Step 4.
3. **Release client** — Package name `com.expensetracker`, SHA-1 = the `release` variant from Step 4.

**b. Web application client** (provides the `webClientId` used for the ID token / offline access):

1. **"Create Credentials"** → **"OAuth client ID"** → application type **"Web application"**
2. Copy its client ID into `.env` as `GOOGLE_WEB_CLIENT_ID`

> Custom redirect URI schemes are **not** used — google-signin uses the native
> Credential flow, so there is no `GOOGLE_OAUTH_REDIRECT_URI`.

### Step 4: Obtain SHA-1 Fingerprint

**For Debug Builds:** this project signs debug builds with the committed project-local
`android/app/debug.keystore`, **not** the global `~/.android/debug.keystore`:

```bash
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android
```

Or read it authoritatively (debug + release) with `pnpm signing:report`.

> The debug build installs as **`com.expensetracker.debug`** (`applicationIdSuffix` in
> `android/app/build.gradle`), so register this SHA-1 under that package — not `com.expensetracker`.

**For Release Builds:**

```bash
# First, generate a release keystore (if you don't have one)
keytool -genkey -v -keystore expense-tracker-release.keystore -alias expense-tracker -keyalg RSA -keysize 2048 -validity 10000

# Then, get the SHA-1 fingerprint
keytool -list -v -keystore expense-tracker-release.keystore -alias expense-tracker
```

Copy the **SHA-1** value and paste it into Google Cloud Console.

### Step 5: Copy the Web Client ID

1. Open the **Web application** client you created
2. Copy its **Client ID** (format: `<hash>.apps.googleusercontent.com`)
3. Paste it into your `.env` file as `GOOGLE_WEB_CLIENT_ID`

The Android client needs no value in `.env` — it is matched by package name + SHA-1.

### Step 6: Verify Configuration

1. Rebuild the app: `pnpm android` (or `pnpm build:android:release` for release)
2. Open the app and navigate to **Settings** → **Export to Google Drive**
3. Tap **"Sign in with Google"**
4. You should see the Google account picker and consent screen
5. Grant permission to access Drive files
6. The app will display your account info and "Connected" status

### Troubleshooting OAuth

See [DEPLOY.md - Troubleshooting PKCE Issues](./DEPLOY.md#troubleshooting-pkce-issues) for common OAuth errors and solutions.

---

## 💻 Development Workflow

### Available Scripts

| Command                      | Description                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `pnpm start`                 | Start Metro bundler (keep running during development)                         |
| `pnpm android`               | Build and run Android app in debug mode                                       |
| `pnpm test`                  | Run Jest test suites                                                          |
| `pnpm test:watch`            | Run tests in watch mode (re-run on file changes)                              |
| `pnpm test:coverage`         | Generate test coverage report                                                 |
| `pnpm lint`                  | Run ESLint to check code quality                                              |
| `pnpm lint:fix`              | Auto-fix ESLint issues where possible                                         |
| `pnpm typecheck`             | Run TypeScript compiler in check mode (no emit)                               |
| `pnpm format`                | Format code with Prettier                                                     |
| `pnpm validate`              | Run lint, typecheck, and tests (CI-style validation)                          |
| `pnpm build:android:release` | Build release APK (see [DEPLOY.md](./DEPLOY.md))                              |
| `pnpm build:android:bundle`  | Build release App Bundle (.aab) for Play Store (see [DEPLOY.md](./DEPLOY.md)) |

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

### App Icon

The launcher icon is generated from a single source image, `scripts/assets/logo.png`, by `scripts/generate-icons.mjs` (uses `sharp`). It emits the adaptive-icon layers (`mipmap-anydpi-v26/`, per-density foreground PNGs, `values/ic_launcher_background.xml`) plus the legacy `ic_launcher` PNGs across all densities. To regenerate after replacing the source image:

```bash
node scripts/generate-icons.mjs
```

Tune the `BACKGROUND` colour and the `*_FRACTION` framing constants at the top of the script, then rebuild Android (`cd android && ./gradlew clean`) to pick up the new resources.

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

- **Target**: >80% line coverage, enforced in CI
- **Current**: ~94% overall; ~95% across business logic (repositories, migrations, CSV export, utils, Google auth). Thresholds are enforced — `pnpm validate` runs `test:coverage` and `jest.config.js` fails the build if coverage regresses.

### Performance Tests

A performance suite validates large-dataset behaviour (10k expenses), CSV export speed, and auto-lock timeout accuracy at every preset. Run it with:

```bash
pnpm test src/__tests__/performance/
```

### Known Limitations

- **CI** — `.github/workflows/validate.yml` runs `pnpm validate` (lint + typecheck + tests) on every push/PR; `.github/workflows/release-build.yml` exercises a signed `assembleRelease` on demand or on a `v*` tag (skipped until release signing secrets are configured). On-device release smoke testing remains manual (see `DEPLOY.md`).
- **Navigation and theme are excluded from coverage** by design (`jest.config.js` `collectCoverageFrom`) — they are declarative wiring with no unit-testable branches. All logic-bearing layers (context, screens, repositories, export, security, utils) are covered under enforced thresholds.
- **No real-device performance testing** — performance is validated algorithmically, not on physical hardware.

### Test Categories

1. **Unit Tests**: Pure functions (validation, formatting, math)
2. **Repository Tests**: Database operations (CRUD, queries)
3. **Integration Tests**: Multi-layer flows (CSV export, OAuth)
4. **Component Tests**: React component behavior (CategoryPickerDialog, CurrencyPickerDialog, all screens)

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

See **[DEPLOY.md](./DEPLOY.md)** for comprehensive instructions on:

- Generating release keystores
- Configuring signing credentials
- Building production APKs and App Bundles (.aab)
- Installing on devices
- OAuth 2.0 PKCE setup and verification

Release builds run R8 (code shrinking + obfuscation) and resource shrinking, so
the first build is slower and native crash stack traces are obfuscated — retain
the per-build `mapping.txt` to deobfuscate them (see DEPLOY.md).

### Quick Release Build

```bash
# Set release signing environment variables (see DEPLOY.md)
export RELEASE_STORE_FILE=./expense-tracker-release.keystore
export RELEASE_STORE_PASSWORD=your-password
export RELEASE_KEY_ALIAS=expense-tracker
export RELEASE_KEY_PASSWORD=your-password

# Build a release APK (sideload)
pnpm build:android:release
# ...or a release App Bundle for the Play Store
pnpm build:android:bundle
```

Output: `android/app/build/outputs/apk/release/app-release.apk` (APK) or
`android/app/build/outputs/bundle/release/app-release.aab` (App Bundle).

---

## 📁 Project Structure

```
PET/
├── android/                    # Android native code
│   ├── app/
│   │   ├── build.gradle        # App-level Gradle config (signing, OAuth redirect)
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       └── java/com/expensetracker/
│   │           └── pincrypto/  # AppPinCrypto TurboModule (PBKDF2, SecureRandom)
│   └── build.gradle            # Project-level Gradle config (SDK versions)
├── src/
│   ├── components/             # Reusable UI components
│   │   ├── CategoryPickerDialog.tsx
│   │   ├── CurrencyPickerDialog.tsx
│   │   ├── FundPickerDialog.tsx
│   │   ├── SearchField.tsx     # Shared search input for lists and the ledger
│   │   └── SuggestionList.tsx  # Frequency-ranked fills under a text field
│   ├── constants/              # Static data
│   │   ├── currencies.json     # ISO-4217 currency list
│   │   ├── currencyOptions.ts  # Currency picker data
│   │   └── defaultCategories.ts # Initial typed category seed
│   ├── context/                # React Context state management
│   │   └── AppContext.tsx      # Global app state (expenses, categories, settings)
│   ├── database/               # SQLite layer
│   │   ├── database.ts         # Database initialization, connection
│   │   ├── migrations.ts       # Schema migrations (v1-v12)
│   │   ├── snapshot.ts         # Pre-migration database copy (WAL-checkpointed)
│   │   ├── seeding.ts          # Default data seeding
│   │   ├── repositories/       # Data access layer
│   │   │   ├── transactionsRepository.ts
│   │   │   ├── categoriesRepository.ts
│   │   │   ├── fundsRepository.ts
│   │   │   ├── settingsRepository.ts
│   │   │   └── exportQueueRepository.ts
│   │   └── __tests__/          # Database tests
│   ├── export/                 # CSV export and Drive upload
│   │   ├── csvColumns.ts       # Canonical column contract (shared with import)
│   │   ├── csvBuilder.ts       # CSV generation (RFC 4180)
│   │   ├── driveUploader.ts    # Google Drive upload client
│   │   ├── driveDownloader.ts  # Google Drive list + download (alt=media)
│   │   ├── exportQueueManager.ts # Queue operations
│   │   └── __tests__/          # Export tests
│   ├── import/                 # CSV import (inverse of export)
│   │   ├── csvParser.ts        # RFC 4180 parser (BOM/CRLF, quoted fields)
│   │   ├── mapping.ts          # Column mapping + date/time-format normalization
│   │   ├── categoryMatching.ts # Near-duplicate category-name detection
│   │   ├── fxGuards.ts         # FX plausibility guards (typed + derived rates)
│   │   ├── importManager.ts    # Preview (validate) + commit (atomic bulk insert)
│   │   └── __tests__/          # Import tests
│   ├── navigation/             # React Navigation
│   │   └── AppNavigator.tsx    # Stack navigator definition
│   ├── screens/                # Screen components
│   │   ├── HomeScreen.tsx      # Transaction list + filters + period summary
│   │   ├── AddTransactionScreen.tsx # Create/edit transaction form
│   │   ├── SettingsScreen.tsx  # App settings
│   │   ├── ManageCategoriesScreen.tsx # Category CRUD
│   │   ├── ManageFundsScreen.tsx # Fund CRUD and balances
│   │   ├── ExportQueueScreen.tsx # Backup queue management
│   │   ├── homeUtils.ts        # Home screen helper functions
│   │   ├── transactionFormUtils.ts # Form validation and payload building
│   │   └── __tests__/          # Screen tests
│   ├── security/               # Authentication and storage
│   │   ├── googleAuth.ts       # OAuth 2.0 with PKCE
│   │   ├── storageAccess.ts    # Android SAF (Scoped Storage)
│   │   ├── NativeAppPinCrypto.ts # TurboModule spec: PBKDF2 + CSPRNG
│   │   ├── pinHash.ts          # PIN record: derive, constant-time verify, encode
│   │   ├── pinCredential.ts    # PIN storage in Keystore
│   │   ├── pinCalibration.ts   # Per-device iteration count
│   │   ├── lockoutPolicy.ts    # Throttle curve and lockout (pure)
│   │   ├── lockoutStore.ts     # Attempt counter, persisted in Keystore
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
│   │   ├── date.ts             # Date/time utilities (British format, HH:MM parsing)
│   │   ├── math.ts             # Banker's rounding
│   │   ├── suggestions.ts      # Frequency ranking for suggested fills
│   │   ├── textSearch.ts       # LIKE escaping and its matching JS predicate
│   │   ├── transactionFilters.ts # Filter composition over the loaded ledger
│   │   └── __tests__/          # Utility tests
│   └── App.tsx                 # Root component
├── .env                        # Environment variables (NOT IN VCS)
├── .env.example                # Environment template (committed)
├── .eslintrc.js                # ESLint flat config
├── .gitignore                  # Git ignore rules
├── .nvmrc                      # Node version (24.11.1)
├── .prettierrc.js              # Prettier config
├── babel.config.js             # Babel transformer
├── jest.config.js              # Jest test configuration
├── jest.setup.js               # Jest mock setup
├── metro.config.js             # Metro bundler config
├── package.json                # npm dependencies and scripts
├── pnpm-lock.yaml              # pnpm lockfile
├── tsconfig.json               # TypeScript configuration
├── CHANGELOG.md                # User-facing changes per version
├── DEPLOY.md                   # Deployment & release build guide
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

1. **Physical device access** → Mitigated by the app lock (app PIN, plus biometrics where one is enrolled) + Android device encryption
2. **APK reverse engineering** → Mitigated by no embedded secrets (OAuth PKCE, environment vars); R8 obfuscation of release builds raises the bar but is defence-in-depth, not a boundary
3. **SQL injection** → Mitigated by parameterized queries (ESLint-enforced)
4. **Token theft** → Mitigated by Android Keystore (hardware-backed encryption)
5. **Man-in-the-middle** → Mitigated by HTTPS-only APIs, certificate pinning (future enhancement)

**The biometric factor is only real where a biometric is enrolled.** With none enrolled,
`react-native-keychain` stores the gate credential under a no-auth cipher and returns it without
prompting, so the lock would open itself. A device passcode does not change this — the library's
storage choice looks at enrolled biometrics alone. The app therefore checks
`getSupportedBiometryType()` before creating that credential **and** before trusting one, and
falls back to the PIN when it reports none. **The app PIN is the factor that is always enforced.**

**What the app lock does not protect.** The lock guards the **UI**, not the database file. The
SQLite file is not encrypted at rest, so a rooted device or a forensic extraction reads it
whatever the lock is set to. Full-database encryption was considered and declined; the lock's
job is to stop someone picking up an unlocked phone, not to survive an attacker with the
storage in hand.

**A forgotten PIN cannot be recovered.** With the app lock on, a PIN is required, and there is
no reset path by design — the app has no account, no server, and nothing to prove identity
against. If you forget the PIN **and** biometrics no longer work (unenrolled, or the hardware
fails), the only way back into the app is to reinstall it, **which deletes the database along
with the Keystore entries**. Export a CSV you can re-import if that risk matters to you.

**The lockout wait is wall-clock.** Moving the device clock forward shortens it. This is
accepted: an offline app has no trusted time source, and the alternative — a monotonic clock —
resets on the process restart the counter exists to survive.

### Security Features

#### 1. Native Google Sign-In (no embedded secret)

**Why native sign-in?**

- Mobile apps cannot securely store client secrets (APKs can be decompiled)
- Google authenticates the app by package name + signing certificate (SHA-1), so no secret is shipped
- Sign-in runs through Google Play services rather than a browser redirect

**How it works:**

1. The app calls `GoogleSignin.signIn()` (or `signInSilently()`) via Google Play services
2. The Android OAuth client is verified by package name + SHA-1; the `webClientId` yields an ID token
3. `getTokens()` returns a short-lived access token
4. The access token is sent as a `Bearer` header to the Drive REST API, scoped to `drive.file`

**Implementation:** `src/security/googleAuth.ts` configures `@react-native-google-signin/google-signin` with the `drive.file` scope.

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

1. User enables the app lock in Settings. **An app PIN is required first** — the lock has no
   unlock path without one when biometrics fail or were never enrolled
2. App tracks foreground/background state
3. App locks on relaunch (after settings hydrate), and after the configured idle period
4. The lock is enforced even if settings fail to load, whenever **either** credential exists (fail-closed)
5. User authenticates with a biometric, the device credential, or the app PIN
6. Modal blocks UI until authentication succeeds — so where the lock is on but no PIN is set, the
   modal offers enrolment instead of an unlock it could never accept

**Where the biometric credential cannot be created or cannot authenticate** — no secure
hardware, no screen lock set, or no biometric enrolled — the lock still switches on once a PIN
exists, and the unlock screen opens straight on the PIN field. Biometric enrolment is best-effort at that point, never a
precondition: requiring it would deny the lock to exactly the devices the PIN fallback was
added for.

**Auto-lock presets:** Immediately / 1 / 5 / 15 / 30 minutes / Never, stored in
`app_settings.auto_lock_minutes` and defaulting to 5. They govern **background idle only** —
the app still locks on a cold start under every preset, `Never` included. An unreadable or
unrecognised stored value falls back to 5 rather than to `Never`: a garbage read of a security
control fails toward the stricter behaviour.

**Implementation:** `src/context/AppContext.tsx` (Modal-in-Provider) + `src/hooks/useBiometricGate.ts` (cold-start hydration latch + AppState listener + Keychain via `react-native-keychain`)

**Biometric Storage:**

- Service name: `expense-tracker-biometric-gate`
- Access control: `BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE` (invalidates the biometric path on new enrollment, while allowing the device passcode as a fallback so re-enrollment cannot hard-lock the user)

#### 4. App PIN

The fallback for when biometrics fail, are unenrolled, or the device has no passcode set at all
— the last of which the biometric credential above cannot cover, since it cannot even be
created without one.

**Policy:** 6–12 digits, rejecting runs (`123456`), repeated digits (`111111`), short repeated
patterns (`121212`) and a short list of well-known choices. The rule lives in one place,
`validatePin` in `src/utils/validation.ts`.

**Storage:**

- Service name: `expense-tracker-app-pin` (distinct from both the biometric gate and Drive auth)
- Stored value: `{ v, algorithm, iterations, saltB64, hashB64 }` — a PBKDF2-HMAC-SHA256 hash
  over a 16-byte random salt, 256-bit output. **The PIN is never stored, and never reaches
  `app_settings`**; a test asserts both that no settings row holds it and that the security
  layer never calls `setSetting` at all.
- Access control: **none**, and accessibility is `AFTER_FIRST_UNLOCK` rather than a
  `WHEN_PASSCODE_SET…` variant. **Both differ from the biometric entry deliberately**: gating
  the fallback behind biometrics would make it useless in the one case it exists for, and
  requiring a device passcode would make it uncreatable on the passcode-less device it is meant
  to serve. Do not unify the two option sets.
- Storage type: `AES_GCM_NO_AUTH`, with no `securityLevel` requested — hardware-backed Keystore
  is what actually protects a 6-digit PIN, since a 10⁶ keyspace is small enough that the KDF
  alone would not, and this storage type is hardware-backed wherever the device has a TEE.
  Demanding `SECURE_HARDWARE` outright is **not** the same thing: it fails key generation
  rather than degrading, which would leave the PIN unsettable on the low-end hardware this
  fallback exists to serve. The KDF is defence-in-depth for an extracted blob.

**Iteration count is calibrated per device** at enrolment against a ~250 ms budget and clamped
to 100,000–1,000,000, so an old phone stays usable and a fast one is not left under-provisioned.
The count is stored in the record, so raising the parameters later does not lock anyone out.
Calibration runs on enrolment and PIN change only — never on unlock, which stays a pure verify.

**Throttling and lockout:** three free attempts, then an escalating wait (30s, 1m, 2m, 5m, 10m,
15m), then a 30-minute lockout at the tenth failure that clears on its own. Only an attempt
against a PIN that actually exists counts — with none stored there is nothing to be guessing, so
a rising counter would cost the owner a lockout and an attacker nothing. From the first
throttle onward the unlock screen shows how many attempts remain, including between waits, so
the jump from a 30-second pause to a 30-minute lockout is never a surprise. The counter lives in
its own Keystore entry so a force-quit does not reset it. **Only PIN failures count** — the
biometric prompt fires automatically on every lock, so dismissing it is the normal route to the
PIN, and Android throttles biometrics itself. The lockout blocks the PIN path only; biometrics
keep working. **Changing a PIN requires the current one, throttled identically**, so Settings
cannot be used as an unthrottled guessing oracle.

**Implementation:** `src/security/pinHash.ts`, `pinCredential.ts`, `pinCalibration.ts`,
`lockoutPolicy.ts`, `lockoutStore.ts`, over a first-party TurboModule
(`src/security/NativeAppPinCrypto.ts` + `android/app/src/main/java/com/expensetracker/pincrypto/`)
that wraps the platform `SecretKeyFactory` and `SecureRandom`.

**Upgrading an existing install:** a user who had the lock on before the PIN existed is asked to
set one, once, **as soon as biometrics have unlocked the app**. The unlock modal covers every
route to Settings, so the prompt is hosted there, but it never replaces the biometric check:
offering it — or its decline — before unlocking would let anyone holding the phone switch the lock
off. Only where no factor exists at all (no usable biometric and no stored PIN) is it offered at
the lock itself, since there is nothing to bypass. **Declining turns the app lock off** and says
so, rather than leaving the lock on with no way past it. A stored PIN that cannot be read is not
treated as missing: the app stays locked behind biometrics, or stays locked outright where none
are available.

#### 5. Parameterized SQL Queries

**Enforcement:**

- Custom ESLint rule detects `executeSql` calls with template literals or string concatenation
- All queries must use `?` placeholders and value arrays

**Example:**

```typescript
// ❌ WRONG (ESLint error)
db.executeSql(`SELECT * FROM transactions WHERE id = ${id}`);

// ✅ CORRECT
db.executeSql('SELECT * FROM transactions WHERE id = ?', [id]);
```

#### 6. Secret Detection

**ESLint Plugin:** `eslint-plugin-no-secrets`

- Scans code for high-entropy strings (potential API keys, tokens)
- Tolerance: 4 (flags strings with >4 shannon entropy)
- Fails CI build on detection

#### 7. No Dynamic Code Loading

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

- Ensure release signing environment variables are set (see [DEPLOY.md](./DEPLOY.md))
- Or build debug APK instead: `pnpm android`

---

#### 3. OAuth Errors

**Error:** `DEVELOPER_ERROR`

**Solution:**

- Verify `GOOGLE_WEB_CLIENT_ID` in `.env` is the **Web application** client ID
- Ensure an **Android** OAuth client exists for your build's package + SHA-1 (debug is `com.expensetracker.debug`, release is `com.expensetracker`)
- Rebuild app after changing `.env`: `pnpm android`

**Error:** `PLAY_SERVICES_NOT_AVAILABLE`

**Solution:**

- Run on a device/emulator that has **Google Play services** (use a "Google Play" emulator image, not AOSP)

---

#### 4. Database Errors

**Error:** `no such table: transactions`

**Solution:**

- Database migrations may have failed
- Clear app data:
  ```bash
  adb shell pm clear com.expensetracker
  ```
- Reinstall app: `pnpm android`

**Error:** Writes fail after installing an older build over a newer database

**Solution:**

- Schema migrations are forward-only; there are no down-migrations. An older APK
  can still read a newer database, but its inserts omit columns the newer schema
  requires (`transactions.fund_id`), so every write fails.
- Reinstall the newer build, or clear app data to start fresh:
  ```bash
  adb shell pm clear com.expensetracker
  ```
- A copy of the database taken immediately before the last migration is kept in
  the app's `pre-migration/` directory until the next clean launch.

---

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

#### 7. Unexpected Text on an Older Transfer

**Problem:** A transfer shows a description or payee you did not mean it to have, and offers that text as a suggestion on later transfers.

**Cause:** Switching a part-filled form to Transfer clears the category but keeps whatever was typed into the description and payee, and saving stores it.

**Solution:**

- Open the transfer from Home and clear the field, then save. The text stops being offered as a suggestion once no transfer carries it.

---

#### 8. Git Hook Failures

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
- [@react-native-google-signin/google-signin](https://github.com/react-native-google-signin/google-signin) - Native Google sign-in for Drive access
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
