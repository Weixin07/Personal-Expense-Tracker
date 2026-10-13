# PLAN

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

Plan every impact surface marked `in scope` in `analysis.md`, covering every severity from lowest to critical and every affected layer. Give one line of industrial example per choice, call out backwards-compatibility risk, and order the plan by dependency (data → service → API → client → UI → tests → config). Do not implement anything.

- **Every choice is a decision** under the contract. When a choice has options, base the recommendation on consistency with existing code first and industrial practice second, and cite the code it is consistent with.
- **Plan only within the in-scope paths.** A step that would need another path is a `HALT` (rule 2).
- **Give each step a check** that VERIFY can run: a test name, a grep, a command and its expected output.
- **Include the task's Done-when** as the final check, exactly as the backlog words it, or as its **Amended** text where there is one.
- **For a `patches/` change**, follow the pnpm-patch memory's steps: `--edit-dir`, Prettier on the lockfile, mutants restored from a pristine copy, then the store rebuilt and compared with `cmp`.

Write the plan to `plan.md` in the run directory, with numbered steps (P1, P2, …) and a final **Checks** list.
