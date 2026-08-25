# Changelog

User-facing changes, newest first, in the words a user of the app would use.

Versions match `versionName` in `android/app/build.gradle`. Every distributed
build also bumps `versionCode` — see [DEPLOY.md](DEPLOY.md). Entries under
**Unreleased** have not been cut into a build yet.

Schema-compatibility notes for older builds live in DEPLOY.md's forward-only
migration table, not here.

## [Unreleased]

### Added

- **Transfers remember their exchange rate.** When you record a transfer between
  two funds in different currencies, the app now remembers what the destination
  currency was worth. The next transfer between those same two currencies
  arrives with the amount received already filled in — edit it if the rate has
  moved, and the app remembers the new one.

  **This starts from your next transfer.** Transfers already saved on your phone
  are left exactly as they are, so the first transfer you record between a given
  pair of currencies still asks for the amount received. The second one won't.

- **Importing remembers destination rates too.** A rate you type into the
  import review step for a cross-currency transfer is now saved for later manual
  entry, the same way rates for ordinary transactions already were. The review
  step still names every rate it will save before the import runs, and the
  summary repeats them afterwards.

### Changed

- Fields that used to be blank now fill themselves in. If a prefilled figure is
  wrong, type over it — what you type is what gets remembered.

- You may see exchange-rate warnings you have never seen before. The app has
  always checked a rate against the last one you used, but for destination
  currencies it had no earlier rate to check against. Now it does.

- A transfer whose two amounts imply that both currencies are worth the same is
  queried before saving and is not remembered, so a figure entered twice by
  mistake cannot become the default.

- When one import file carries two different rates for the same currency pair,
  the one you confirmed at the review step is the one saved. Previously
  whichever row came first won.
