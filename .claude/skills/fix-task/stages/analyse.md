# ANALYSE

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

Analyse the task in the Inputs against the codebase. Find every impact surface — every file, layer, and convention the task lands on — and the work each surface needs. Analyse each surface individually, write out what it needs (if anything), and flag any ambiguity in the task itself. If a layer is unaffected, state it and justify why. Do not implement anything, and do not plan beyond the analysis.

- **If the task's section has an `**Open:**` item**, confirm that a later **Decided** paragraph closes it. If one isn't closed, return `HALT` (rule 1).
- **Resolve every ambiguity as a decision** under the contract: options, recommended pick, source. An ambiguity that needs a process or scope choice is a `HALT` (rule 2).
- **Re-check every file and line the task cites**, since the backlog can be stale. A citation that no longer matches is a decision, citing what the code shows now.
- **Mark each surface `in scope` or `none`.** Later stages must not touch a `none` surface, and the orchestrator compares the final diff against the `in scope` list.

Write the report to `analysis.md` in the run directory, with these sections:

1. Decisions
2. Facts found
3. Impact surfaces (each marked `in scope` or `none`, with what it needs)
4. Unaffected layers
5. Ambiguities and how each was resolved
6. **In-scope paths:** a plain list of every file path the later stages may change
