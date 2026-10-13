# COMMIT MESSAGE

Follow `_contract.md`, which precedes this prompt: its rules and its output footer apply to this stage.

Review the last 20 commit messages (`git log -20 --format='%B%n----'`) and mimic their tone and style. Write one message for the current changes (`git diff`, plus any untracked files from `git status --porcelain`) to `commit-message.txt` in the run directory. **Do not commit.**

- **Subject:** one line in the house style. It states the behaviour that now holds, in plain words, with no task id and no prefix.
- **Body:** the problem, then what now happens, wrapped at about 72 columns. Add an `Also:` paragraph only for a genuinely separate part.
- **Closing line,** when it applies, in the house form, for example `Tooling only, no APK rebuild. Schema stays v<n>.` Take `<n>` from the latest migration in the code, not from memory.
- **No trailers.** The owner commits as themselves.

Then ask yourself whether the message needs to be as complete as it is. Compare it with the length and detail of the last 20 messages for changes of a similar size. Trim it if it is longer than its peers, and log the verdict as a decision, with the commits you compared it against as its source.
