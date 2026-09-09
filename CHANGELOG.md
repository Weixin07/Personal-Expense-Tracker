# Changelog

User-facing changes, newest first, in the words a user of the app would use.

Versions match `versionName` in `android/app/build.gradle`. Every distributed
build also bumps `versionCode` — see [DEPLOY.md](DEPLOY.md). Entries under
**Unreleased** have not been cut into a build yet.

Schema-compatibility notes for older builds live in DEPLOY.md's forward-only
migration table, not here.

## [Unreleased]

### Added

- **Tick off the rows you have checked.** Every transaction now carries a
  confirmed mark, and each row on Home has a control to set or clear it. Rows
  you enter yourself start confirmed. **Rows you import start unconfirmed**, so
  an import gives you a review queue: work down it, ticking rows off as you
  check them against your statement.

  The old "Needs review" filter is now **"Needs attention"**, and covers both
  things worth a second look — transfers whose two amounts imply an exchange
  rate their currencies contradict, and rows you have not confirmed. The chip
  is always available, and each row says which of the two applies: `⚠ 1:1` for
  the suspect rate, `○ Unconfirmed` for the tick you have not given yet.

  **The confirmed mark does not travel in a CSV.** The export is a portable
  interchange file of 17 fixed columns, not a complete backup, so rows you
  export and import again come back unconfirmed. The import review says so
  before you commit.

- **Search your transactions.** Home has a search box that looks through the
  description, payee and notes of every transaction. It works alongside the
  filters you already have set rather than replacing them — search for "coffee"
  with the Food category and last month selected, and you get coffee, in Food,
  last month. Reset clears the search along with everything else.

  **The period summary follows your search.** Spent, Received and Net describe
  the rows you can see, so searching narrows them too. Your fund balances do
  not move: those are what is actually left in each pot, over your whole
  history, and no filter changes that.

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

- **Each pot now shows a single figure.** Before, a pot that had received money
  in another currency showed a separate line per currency. It now reports one
  balance, in its own currency.

- **A transfer moves exactly what it took.** The destination pot is credited the
  value that left the source, converted at the rate you confirmed. So if fees
  meant slightly less arrived than you sent, that difference no longer shows up
  anywhere — the pot reports the full amount as having arrived. This reverses
  how transfers behaved earlier in this same unreleased window.

- **A pot held in a currency other than your base currency is shown using your
  most recent rate for that pair.** Its figure can therefore move when you enter
  a newer rate, even though nothing about the pot itself changed.

- **A pot the app cannot express as one figure says so.** If you have no saved
  rate covering one of its currencies, it lists its figures separately and marks
  them `⚠ unconverted` until a rate is available.

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
