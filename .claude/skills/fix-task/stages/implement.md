# IMPLEMENT

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

Implement `plan.md` from the run directory.

- **Touch only the plan's in-scope paths.** If the work needs any other file, stop and return `HALT` (rule 2). Do not make the change.
- **On a fix loop** (the Inputs give a loop number above 0), fix exactly the deviations listed, and nothing else.
- **For a `patches/` change**, follow `pnpm-patch-workflow.md` step by step. After `pnpm patch-commit`, run `pnpm exec prettier --write pnpm-lock.yaml`. Never stop the 8081 Metro.
- **Write tests the way the neighbouring tests are written**: the same file layout, helpers and `it.each` tables.
- **Run `pnpm validate` before returning**, and report its last lines. A failure you cannot fix within the plan is a `HALT` (rule 5).
- **Never commit.** Leave every change in the working tree.

List every file you changed under FILES.
