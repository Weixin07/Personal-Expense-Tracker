# VERIFY

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

You start with no knowledge of how the change was made. Verify that every requirement item has been met: for each impact surface in `plan.md`, confirm the code landed, the convention was followed, and no unrelated behaviour regressed. Then answer one more question: **does the change actually solve the task's problem?** Justify every verdict with a reference to `plan.md` and to the code.

## Checks

Record each check's command and the relevant lines of its output:

1. `git status --porcelain` and `git diff --stat`. Every path must be in `analysis.md`'s in-scope list.
2. Each step's check from `plan.md`.
3. The task's Done-when, run exactly as worded (or its **Amended** text).
4. `pnpm validate`, recording the suite and test counts.
5. `pnpm comment-policy`.

## Emulator smoke

**The smoke runs only if the diff reaches the bundle.** That means `git diff --name-only` plus untracked files includes any of:

- `src/**`, `index.js`, `App.tsx`, `app.json`, `babel.config.js`, `metro.config.js`, `patches/**`;
- a change to `dependencies` in `package.json`.

**If not**, record `smoke skipped: nothing bundled`, followed by the file list.

**If so**, use the serial from the Inputs and follow `emulator-testing-gotchas.md`. Set `MSYS_NO_PATHCONV=1` for device paths, `rm -f` the dump file before each `uiautomator dump`, and run `adb shell sync` before anything that could kill the emulator.

1. **For a `patches/` change only**, set up the spare Metro first, because 8081 still serves the old library:
   - run `pnpm start --port 8082 --reset-cache` in the background;
   - run `adb -s <serial> reverse tcp:8082 tcp:8082`;
   - write `debug_http_host` = `localhost:8082` into `shared_prefs/com.expensetracker.debug_preferences.xml` via `run-as`;
   - grep the bundle for the new code.
2. Run `adb -s <serial> logcat -c`, then `am force-stop com.expensetracker.debug`, then `am start -n com.expensetracker.debug/com.expensetracker.MainActivity`.
3. Confirm the lock card shows. Unlock it with the test PIN recorded in `emulator-testing-gotchas.md`, and confirm Home shows.
4. Grep `logcat -d` for `FATAL EXCEPTION` and for `ReactNativeJS` errors. There must be none.
5. **For a `patches/` change only**, clean up afterwards:
   - remove the `adb reverse`;
   - delete the `debug_http_host` file;
   - stop the 8082 Metro by the process listening on that port;
   - above the footer, add a note for the owner: "restart 8081 with `--reset-cache`".

An adb or emulator step that fails is a `HALT` (rule 6), not a `DEVIATION`.

## Result

- `STATUS: OK` when every check passes and the change solves the problem.
- `STATUS: DEVIATION` otherwise, followed by a numbered **Deviations** list above the footer. Each item gives what is wrong, the evidence, and the plan step it breaks.
- Do not fix anything yourself.
