# CLAUDE.md

## Written Documentation

All written documentation must pass through the Simple English skill: https://github.com/AminBlg/SimpleEnglish. Documentation includes docs pages, READMEs, `CLAUDE.md` files, help text in the UI, and commit messages.

1. Before you write documentation, read `skills/simple-english/SKILL.md` in that repository. If the skill is not installed, clone the repository first.
2. Write the English text, then translate it. A translation follows the English text and does not get its own rewrite.
3. Before you commit, lint the English text with `python3 evals/ste_lint.py --type descriptive <file>` from the skill repository. For steps, use `--type procedural`.
4. If the linter reports a violation, correct the text and lint it again.

The rules do not apply to code, identifiers, or the chat messages that the bot writes in its own voice. The skill does not cover brand writing, and those messages are brand writing.
