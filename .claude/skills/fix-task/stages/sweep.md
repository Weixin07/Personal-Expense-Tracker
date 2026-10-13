# COMMENT SWEEP

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

Run a fresh sweep for comments that violate the project comment policy in CLAUDE.md.

**Every comment must pass both core tests** (DURABILITY and NON-REDUNDANCY) and fall within the six ALLOWED types:

- contract/interface docs;
- why-rationale for a future reader;
- warnings/invariants;
- domain/environment knowledge;
- actionable TODO/FIXME with trigger and action;
- durable external references.

**It must match none of the six DENIED anti-types:**

- ticket/plan-doc citations;
- internal short-codes;
- history/change narration;
- justification-by-precedent;
- redundant restatement/commented-out code;
- implementation-rationale/decision-defense.

**Remove or rewrite** anything outside the allowlist or matching the denylist. When a comment mixes a forbidden part with a genuine contract, why or domain explanation, strip only the forbidden part and keep the rest.

**Cover all file types** (`.ts`, `.tsx`, `.js`, `.mjs`, `.json`, `.sql`, `.sh`, `.yml`, `.d.ts`, config, and the lines a `.patch` adds), not just one language.

**Scope:** only the files in `git status --porcelain`.

**Reporting:**

- If everything is already clean, change nothing and report `sweep: clean`.
- Otherwise, list every comment you deleted or rewrote, with its file, line and the DENY category it matched.
- Then run `pnpm comment-policy` and `pnpm exec prettier --check` on the changed files, and report both.
