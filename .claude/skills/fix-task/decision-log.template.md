# /fix-task decision log — <ID>

## 1. Header

| Field   | Value                                                  |
| ------- | ------------------------------------------------------ |
| Task    | <ID> — <title>                                         |
| Started | <ISO time>                                             |
| Ended   | <ISO time>                                             |
| HEAD    | <sha at start>                                         |
| Status  | awaiting commit / halted at <stage>: rule <n> / denied |

## 2. Gate

| #   | Command | Output | Result |
| --- | ------- | ------ | ------ |
| S   |         |        |        |
| M   |         |        |        |
| C1  |         |        |        |
| C2  |         |        |        |
| C3  |         |        |        |
| C4  |         |        |        |
| C5  |         |        |        |
| E   |         |        |        |

## 3. Decisions

| #   | Stage | Question | Options | Recommended | Taken | Source | Reverse by |
| --- | ----- | -------- | ------- | ----------- | ----- | ------ | ---------- |

## 4. Halts

None.

## 5. Verify loops

| Loop | Deviations found | Fix | Result |
| ---- | ---------------- | --- | ------ |

## 6. Checks

- `pnpm validate`:
- `pnpm comment-policy`:
- `pnpm format:check`:
- Done-when check:
- Emulator smoke:
- Comment sweep:

## 7. Files changed

```
<git status --porcelain>
<git diff --stat>
```

## 8. New findings filed

None.

## 9. Commit message

Drafted in `commit-message.txt`. Completeness check:

## 10. Follow-ups for the owner

- Review this log against section 11, then commit.

## 11. Review checklist

- [ ] **Gate:** S, M, C1–C5 and E each show the command and its output, including curl's attempt output for E.
- [ ] **Decisions:** every row has a Source, and no row is a process or scope choice.
- [ ] **Traceability:** every path in Files changed is **in scope** in `analysis.md`, and no surface marked **none** appears.
- [ ] **Checks:** `pnpm validate` (suites and tests), `pnpm comment-policy`, `pnpm format:check`, the Done-when check's own output, and the smoke result or "skipped: nothing bundled" with its file list.
- [ ] **Loops:** zero to two fix loops, each with what was found and how it was fixed.
- [ ] **Sweep:** "clean", or every deletion with its DENY category.
- [ ] **Commit message:** it matches the house style of the last 20 commits, and its completeness verdict is logged.
- [ ] **Findings:** each new FIX entry exists in the backlog.
- [ ] **Clean end:** the marker is gone, and no `stash`, `reset` or `checkout` appears in the run.
