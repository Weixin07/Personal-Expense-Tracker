# Personal Expense Tracker

This React Native app is being built as an offline-first personal expense tracker with optional Google Drive export utilities. All code is written in TypeScript and targets Android (API 28+).

## Environment setup

1. Install Node.js v22 (recommended via [nvm-windows](https://github.com/coreybutler/nvm-windows)) and run 
vm use 22.19.0 to match the .nvmrc file.
2. Enable Corepack once globally: corepack enable (also handled automatically by pnpm install).
3. Install project dependencies with pnpm install (pnpm is pinned through packageManager in package.json).
4. For Android development, install the Android SDK, Java 17, and configure the required environment variables as outlined in the [React Native setup guide](https://reactnative.dev/docs/set-up-your-environment).
5. (Optional iOS development) requires macOS with Xcode and CocoaPods; follow the official React Native documentation.

## Scripts

| Command | Description |
| --- | --- |
| pnpm start | Launch Metro bundler. |
| pnpm android | Build and run the Android app. |
| pnpm test | Execute Jest test suites. |
| pnpm lint | Run ESLint across the codebase. |
| pnpm typecheck | Run TypeScript in no-emit mode. |
| pnpm format | Format files with Prettier. |
| pnpm validate | Run lint, typecheck, and tests in sequence. |

## Tooling guardrails

- **ESLint** enforces security and offline constraints (e.g., no inline secrets, parameterised SQL requirements, no lazy loading). Use pnpm lint --fix to address issues automatically where possible.
- **Prettier** keeps formatting consistent; run pnpm format before committing large changes.
- **TypeScript** compilation is wired through pnpm typecheck and is part of the pre-commit pipeline.
- **Jest** is configured for unit tests; use pnpm test --watch while developing.

## Git workflow

- Branch naming: eature/<short-description>, ugfix/<ticket-or-context>, chore/<maintenance>, docs/<area>.
- Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org/) style, e.g., eat: add expense form validation or chore: update lint config.
- Before pushing, run pnpm validate to ensure lint, typecheck, and tests are green.

## Husky & lint-staged

- Dependencies installation triggers the prepare script (husky install) to wire Git hooks.
- Pre-commit hook runs pnpm lint-staged, which:
  - Lints staged TypeScript/JavaScript files with ESLint (no warnings allowed).
  - Runs Jest on tests related to staged files.
  - Formats staged resources with Prettier.
- If pnpm is not on your PATH, install it via Corepack (corepack enable pnpm) before committing.

## Secure coding guidance

- Never hard-code API keys or secrets. Use environment files and the native keystore/secure storage as required.
- All SQLite interactions must use parameterised queries (executeSql with placeholders and value arrays).
- Keep the app offline-first: avoid adding network calls outside of explicit export/auth flows.

## Troubleshooting

- If Git hooks fail because pnpm is missing, run corepack enable pnpm and reinstall dependencies.
- When ESLint flags potential secrets, verify and refactor them into environment-managed values.
- For React Native environment issues, consult the official troubleshooting guide and ensure the Android emulator/device meets the target API level.