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
6. **Implementation-rationale / decision-defense** — narrates or defends the choice you made while doing the task, or answers an objection no future reader would raise, rather than explaining something the reader of the finished code needs. Litmus: does it serve a future reader of the code, or does it answer "why did you write it this way?" to someone watching you work? If the latter, remove it.

## How to Apply

- Run the two core tests on every comment. Fail either → don't write it (or remove it). The lists are illustrations; the tests are the tiebreaker.
- Keep substantive content: when a comment mixes a forbidden element (e.g. a ticket prefix or a task-time defense) with a genuine contract, rationale, or domain fact, strip only the forbidden part and keep the real explanation.
- Relocate, don't discard, genuinely useful process or decision narration — its home is the commit message or change description, bound to the change rather than the steady-state code.
- Prefer encoding intent in names (descriptive functions and tests) over comments.
- Respect deliberate structural/section dividers used as consistent house style — those are formatting, not violations.
