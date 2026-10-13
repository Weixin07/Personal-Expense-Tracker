---
name: fix-task
description: Run one backlog FIX task unattended, from its gate to "awaiting commit", with a decision log. Only for tasks that pass the gate below. Run in auto mode.
argument-hint: <FIX-ID>
disable-model-invocation: true
---

# /fix-task $ARGUMENTS

Runs backlog task `$ARGUMENTS` from `doc-temp/pet-task-backlog.md` through six stages, one subagent each, and stops at **awaiting commit**. The owner reviews the decision log and commits. The stages are adapted from the hand-driven prompts in `doc-temp/claude-commands/new-requirements claude commands.txt`; when the wording of one set changes, review the other.

## Before you run

- Runs assume auto mode. In any other permission mode, Claude Code prompts for file writes and for shell commands the committed allow list doesn't cover, and the run is no longer unattended.
- The API 36 emulator must be booted and the 8081 Metro answering before you start (gate E).

## Rules for this session

- Never call `AskUserQuestion` and never wait for the owner. Anything you would ask goes to the decision log, and if it matches a halt rule, the run halts.
- Never run `git commit`, `push`, `stash`, `reset --hard`, `checkout -- …`, `restore`, `clean` or `rebase`. While the marker exists, `scripts/fix-task-guard.mjs` blocks them anyway.
- Never stop or restart the Metro on port 8081.
- Run the stages one at a time, and wait for each result before starting the next.
- Do not edit source yourself. Only the IMPLEMENT stage edits source and tests.
- Write everything for this run under `doc-temp/fix-task/$ARGUMENTS/`.

## 0. Argument

If `$ARGUMENTS` does not match `^FIX-[0-9]+$` (test it with `grep -qE '^FIX-[0-9]+$'`, exactly and case-sensitively), or `doc-temp/pet-task-backlog.md` has no heading starting `### $ARGUMENTS ` (with the trailing space, so `FIX-2` doesn't match `FIX-23`), print `Usage: /fix-task FIX-<n>; '$ARGUMENTS' is not a FIX id or has no backlog entry.` and stop without writing anything.

Extract the task's section, from its heading up to the next `### ` heading or `---` line:

```sh
awk -v id="### $ARGUMENTS " 'index($0,id)==1{f=1;print;next} f&&(/^### /||/^---$/){exit} f' doc-temp/pet-task-backlog.md
```

Within the section, the **Deliverable**, **Prereqs** and **Done when** are the text after each bold label up to the next bold label. Where an `**Amended …:**` paragraph replaces one of them, the amended text wins.

## 1. Gate

Run every check, even after one fails, and record each check's command and output for the log. Any fail denies the run.

| #   | Check                                                                                                                                                                                                                                                                                                                                                                   | Pass when                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| S   | `head -1` of the section, searched with the S pattern below (`grep -oE`).                                                                                                                                                                                                                                                                                               | No match. A match is a deny: record it, which includes a HELD marker's reason.                                                                 |
| M   | `test -e doc-temp/fix-task/.running`                                                                                                                                                                                                                                                                                                                                    | Absent. If present, print its JSON: another run is active or one crashed.                                                                      |
| C1  | Find `**Open:**` in the section.                                                                                                                                                                                                                                                                                                                                        | None, or each is followed later in the section by a `**Decided` paragraph. ANALYSE then confirms that the Decided text closes every open item. |
| C2  | Search the whole section with the C2 pattern below, since a Deliverable can name the lock without naming its files.                                                                                                                                                                                                                                                     | No match. `src/security/storageAccess.ts` and `googleAuth*` are outside the cluster.                                                           |
| C3  | Search the Done-when, case-insensitive, for `phone`, `device credential`, `\bCI\b`, `push`, `Validate run`, `fresh clone after`.                                                                                                                                                                                                                                        | No match.                                                                                                                                      |
| C4  | Search the Deliverable, case-insensitive, for `android/`, `.java`, `.kt`, `gradle`, `\bJava\b`, `native rebuild`. If the task changes a `pnpm patch`, find the patch from the library the section names and run `grep '^diff --git' patches/<file>`.                                                                                                                    | No match, and every hunk path in that patch ends `.js`, `.cjs`, `.mjs` or `.json`.                                                             |
| C5  | `git status --porcelain`. For each task id in the Prereqs, find its heading's `✅ DONE (<hash>)` and run `git merge-base --is-ancestor <hash> HEAD`.                                                                                                                                                                                                                    | The status output is empty, every prerequisite has a hash, and each is an ancestor. "Prereqs: none" passes.                                    |
| E   | `adb devices`; for the serial in state `device`, `adb -s <serial> emu avd name` is `Medium_Phone_API_36.1`; `adb -s <serial> shell getprop init.svc.bootanim` is `stopped`; `adb -s <serial> shell pm list packages com.expensetracker.debug` lists it; `curl -s -m 5 --retry 2 --retry-delay 5 --retry-all-errors localhost:8081/status` is `packager-status:running`. | Every check passes; curl makes up to three attempts before E fails. Record the serial for VERIFY, and curl's output in the log.                |

The S pattern, for `grep -oE` on the heading line:

```
✅ DONE|✅ CLOSED|⏸ HELD \([^)]*\)
```

The C2 pattern, for `grep -oE` on the section. Plain `lock` is not in it, because the sqlite patch's `txLocks` would match:

```
actionLockPolicy|appLockError|appLockReading|deviceSecurity|FocusBlockView|gateMessages|gatePresentation|lockoutPolicy|lockoutStore|NativeAppLockWindow|NativeAppPinCrypto|outboundFlow|pinCalibration|pinCredential|pinHash|useBiometricGate|react-native-keychain|\bPIN\b|biometric|[Kk]eychain|app lock|lock screen|lock card
```

**On a deny:** create `doc-temp/fix-task/$ARGUMENTS/decision-log.md` from the template, fill in its Header (status `denied: <criteria>`) and Gate sections, and print the final message. Do not create the marker.

## 2. Start

1. Create `doc-temp/fix-task/$ARGUMENTS/`, and copy `.claude/skills/fix-task/decision-log.template.md` to `decision-log.md` in it. Fill in the Header and Gate sections.
2. Write the marker `doc-temp/fix-task/.running` as `{"task": "$ARGUMENTS", "startedAt": "<ISO time>", "head": "<git rev-parse HEAD>"}`.

## 3. Stages

Each stage is one `Agent` call (`general-purpose`). Its prompt is the text of `.claude/skills/fix-task/stages/_contract.md`, then the stage's own file, then an **Inputs** block containing: the task id, the full task section, the run directory, the paths of the earlier artefacts, the emulator serial from E, and for IMPLEMENT and VERIFY the loop number and the previous VERIFY's deviation list.

| Order | Stage file          | Writes                             |
| ----- | ------------------- | ---------------------------------- |
| 1     | `analyse.md`        | `analysis.md`                      |
| 2     | `plan.md`           | `plan.md`                          |
| 3     | `implement.md`      | source and tests                   |
| 4     | `verify.md`         | nothing but its report             |
| 5     | `sweep.md`          | comment fixes in the changed files |
| 6     | `commit-message.md` | `commit-message.txt`               |

After each stage:

1. Read the footer the contract defines. If it is missing or malformed, treat the stage as `HALT` (rule 1).
2. Append its DECISIONS to the log's Decisions table, numbered in order, and its FINDINGS to the New findings list (see §6).
3. Apply the halt rules (§5).

After IMPLEMENT, and after each fix loop:

- run `git status --porcelain` and `git diff --name-only`, and compare every path with the **in scope** surfaces in `analysis.md` (rule 4);
- run `pnpm validate` (rule 5).

## 4. VERIFY loop

If VERIFY returns `DEVIATION`, run IMPLEMENT again with its deviation list (loop 1), then VERIFY again. Allow at most two fix loops. A third `DEVIATION` halts (rule 3). Log each loop in the Verify loops section.

## 5. Halt rules

Halt when any of these holds:

1. A stage returns `HALT` because a decision has no citable source, or its footer is missing or malformed.
2. A stage returns `HALT` for a process or scope choice: a commit split, optional extras, the shape of a CHANGELOG, README or DEPLOY change, or touching any file beyond the Deliverable's named files, their tests, and doc duties the entry names.
3. The third VERIFY still returns `DEVIATION`.
4. A changed or untracked path is not in `analysis.md`'s **in scope** list, or belongs to a surface it marks **none**.
5. `pnpm validate` exits non-zero after IMPLEMENT or after a fix loop.
6. An adb or emulator step fails: no device, boot not complete, the app does not start, or Metro does not answer.

**On a halt:** fill in the log's Halts section (the rule, the stage, and what the owner must decide), plus Checks and Files changed as far as they got. Leave the working tree exactly as it is. Delete the marker, and print the final message.

## 6. New findings

A stage's FINDINGS are not fixed in this run. For each one, append an entry to `doc-temp/pet-task-backlog.md` under the next free number (one more than the highest `FIX-<n>` in the file), placed after the last FIX entry before the next `---`, in the form of its neighbours: `### FIX-<n> — <title>`, then one paragraph starting `Found running /fix-task $ARGUMENTS (<date>).`, with **Deliverable:**, **Prereqs:** and **Done when:** as far as they are known, an **Open:** for what is not, and a priority tag. Filing does not halt the run. Record each new id in the log.

## 7. Finish

1. Fill in the log's Checks, Files changed (`git status --porcelain` and `git diff --stat`), and Commit message sections. Set the status to `awaiting commit`.
2. Append a paragraph to the task's backlog section: `**/fix-task run (<date>): awaiting commit.** Log: doc-temp/fix-task/$ARGUMENTS/decision-log.md. After the commit, add ✅ DONE (<short-hash>) to this heading.`
3. Delete the marker.
4. Print the final message.

## 8. Final message

At most eight lines:

```
/fix-task <ID>: <awaiting commit | halted at <stage>: rule <n> | denied: <criteria>, e.g. S (⏸ HELD (with G25))>
Log: doc-temp/fix-task/<ID>/decision-log.md
pnpm validate: <suites>/<tests> passed | failed | not run
Smoke: ran on <serial>: <result> | skipped: nothing bundled | not run
Changed: <files>
Filed: <new FIX ids or none>
Next: <what the owner does: review the log, commit, then mark the heading ✅ DONE (<hash>); decide the halt; restart 8081 with --reset-cache; …>
```
