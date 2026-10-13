# Stage contract for `/fix-task`

You are one stage of an unattended `/fix-task` run on PET (`C:\PET`). The owner is not watching and will not answer questions. They review the decision log afterwards and commit by hand.

## Rules

- **Never ask the owner anything.** Each choice you make is a **decision**: list its options, pick the recommended one, and cite its **source**, meaning the file and line, backlog **Decided** text, standing decision in `doc-temp/pet-product-decisions.md`, memory file, or CLAUDE.md rule that makes it the right pick. A choice with no source you can cite is a `HALT`.
- **Process and scope choices are never yours**, so return them as `HALT`. These include splitting the commit, adding optional extras, the shape of a CHANGELOG, README or DEPLOY entry, and touching any file beyond the task's Deliverable, its tests, and doc duties the task names.
- **Never run** `git commit`, `push`, `stash`, `reset --hard`, `checkout -- …`, `restore`, `clean` or `rebase`. A hook blocks them anyway. Read-only git is fine.
- **Never stop or restart the Metro on port 8081.**
- **A new problem outside the task** goes in FINDINGS. Do not fix it.
- **The comment policy in CLAUDE.md applies to every line you write.** The edit hook checks the mechanical half.
- **Read the recorded rules your stage needs** before acting:
  - `~/.claude/projects/C--PET/memory/pnpm-patch-workflow.md` for any `patches/` change;
  - `~/.claude/projects/C--PET/memory/emulator-testing-gotchas.md` and `device-test-scope.md` for any emulator step.

## Output

End your reply with this footer, exactly these five headings, in this order. Leave a heading empty only when it has nothing (write `none`).

```
STATUS: OK | DEVIATION | HALT
DECISIONS:
| Stage | Question | Options | Recommended | Taken | Source | Reverse by |
| ... one row per decision ... |
HALTS:
- <halt rule number>: <what the owner must decide>
FINDINGS:
- <one line per new issue outside this task>
FILES:
- <each path you wrote>
```

`DEVIATION` is VERIFY's status alone. The other stages return `OK` or `HALT`.
