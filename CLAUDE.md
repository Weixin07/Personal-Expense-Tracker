# Comment Policy

When writing or editing code, add a comment only if it passes BOTH tests below. This applies to all file types — source, tests, scripts, config, schema/migration, and infrastructure definitions — in any language.

## Core Principle

A comment earns its place only if it passes BOTH tests:

1. **DURABILITY** — Is it still true and useful to someone reading this file a year from now with zero knowledge of the task that produced it? Durable = facts about the code, its environment, or a permanent external reference. Not durable = anything bound to the current task, ticket, plan, or change.
2. **NON-REDUNDANCY** — Does it tell the reader something the code and its types/structure cannot already express? If it just restates the line, it adds nothing.

Default to NO comment. Add one only when it passes both tests. The lists below are these two tests made concrete; when a comment matches no entry exactly, the two tests decide.

## ALLOW — durable and non-redundant

1. **Contract / interface documentation** — what a unit promises: inputs, outputs, errors, invariants. The boundary, not the internal mechanism.
2. **Rationale ("why") for a future reader** — why a non-obvious choice was made over the obvious alternative, written for whoever reads the code later. (Not for an imagined reviewer of your task — see DENY 6.)
3. **Warnings / invariants** — "if you change this, something elsewhere breaks." A constraint or coupling the language cannot enforce.
4. **Domain / environment knowledge** — facts about the world the code runs in (external-system quirks, protocol or standard rules, data constraints) not visible from the code itself.
5. **Actionable TODO / FIXME** — only when it names both a trigger condition AND a concrete action. Vague "improve later" fails.
6. **Durable external references** — standards, specifications, committed design records. An internal ticket or plan-doc reference does not qualify.

## DENY — ephemeral process state, redundant restatement, or decision-defense

1. **Ticket / plan-doc citations** — issue IDs, task numbers, plan-document sections. The task closes and the pointer dies; version control already links the change.
2. **Internal short-codes** — labels keyed to a plan or taxonomy that won't exist later.
3. **History / change narration** — describes a diff, not the current code ("previously…", "was X", "used to…"). Version control owns history.
4. **Justification-by-precedent** — defends a choice by appeal to authority ("industry standard", "like <famous product>").
5. **Redundant restatement** — repeats what the code plainly says. Also remove commented-out code.
6. **Implementation-rationale / decision-defense** — narrates or defends the choice you made while doing the task, or answers an objection no future reader would raise, rather than explaining something the reader of the finished code needs. Litmus: does it serve a future reader of the code, or does it answer "why did you write it this way?" to someone watching you work? If the latter, remove it. Applied mechanically: delete the sentence and ask what the reader can no longer find out. If the only loss is your reasoning, it stays deleted.

## LIMITS — the tests above govern what a comment may say; these govern how much

1. **One block, one contract.** A doc block over 14 lines, or one needing paragraph breaks to stay readable, has left the unit's boundary and started narrating its internals (see ALLOW 1). Cut it back to the contract, or split the unit it documents.
2. **State a rule once.** When a type already carries a rule, code applying that rule points at the type instead of repeating it. Two copies drift apart, and the copy a reader finds first is not reliably the current one. Write the pointer as "under the rule on `X`", naming the symbol that carries it, so every deliberate cross-reference is greppable.
3. **Volume is a signal.** Every comment passing the two core tests individually does not make their density right. A file or diff that is several percent comments is describing code that should have been clearer.

## How to Apply

- Run the two core tests on every comment. Fail either → don't write it (or remove it). The lists are illustrations; the tests are the tiebreaker.
- Keep substantive content: when a comment mixes a forbidden element (e.g. a ticket prefix or a task-time defense) with a genuine contract, rationale, or domain fact, strip only the forbidden part and keep the real explanation.
- Relocate, don't discard, genuinely useful process or decision narration — its home is the commit message or change description, bound to the change rather than the steady-state code.
- Prefer encoding intent in names (descriptive functions and tests) over comments.
- Respect deliberate structural/section dividers used as consistent house style — those are formatting, not violations.
- Write comments after the code works, re-reading it as someone who did not write it. A comment drafted in the same breath as the decision defends the decision (DENY 6); one drafted afterwards describes the code.
- Existing comments are not precedent. This codebase contains comments predating this policy; conform to the policy, not to the surrounding file.
- `scripts/comment-policy.mjs` runs automatically on every edit, and again over the tree via `pnpm comment-policy` and `pnpm test`. It catches stock change-narration phrasings (DENY 3), issue ids (DENY 1), commented-out code (half of DENY 5) and over-long doc blocks. `eslint.config.mjs` surfaces the same phrase list in the editor.
- Because that tool has already run, spend judgement on the four anti-types it cannot see: **history narration in unstocked wording, justification-by-precedent (DENY 4), redundant restatement (DENY 5), and implementation-rationale / decision-defense (DENY 6)**. Passing the tool is necessary, never sufficient — it reads phrasing, not meaning.

## Removing Comments

Removal is not the default. Deleting a real explanation costs more than leaving a mediocre one.

- **PRESERVE** — a contract doc on an exported item, a test fake, a test helper, or a non-obvious invariant is ALLOW 1/3 and survives a sweep. Do not delete it for brevity, and do not delete it merely because a descriptive name already carries part of the meaning.
- Delete only what matches a DENY anti-type outright. Where a comment is borderline, rewrite it rather than remove it.
- When sweeping, list every comment deleted alongside the DENY category it matched, so an over-correction is visible on review.
