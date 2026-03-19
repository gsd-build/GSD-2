# Contributing to GSD-2

We're glad you're here. GSD-2 is an open project and contributions are welcome across the entire codebase. We hold a high bar for what gets merged — not to be gatekeepers, but because every change ships to real users and stability matters.

Read [VISION.md](VISION.md) before contributing. It defines what GSD-2 is, what it isn't, and what we won't accept.

## Before you start

1. **Check existing issues.** Someone may already be working on it.
2. **Claim the issue.** Comment on the issue to get it assigned to you before writing code. This prevents duplicate work and wasted effort.
3. **No issue? Create one first** for new features. Bug fixes for obvious problems can skip this step.
4. **Architectural changes require an RFC.** If your change touches core systems (auto-mode, agent-core, orchestration), open an issue describing your approach and get approval before writing code. We use Architecture Decision Records (ADRs) for significant decisions.

## Opening a pull request

### PR description format

Every PR needs a **TL;DR** and a **detailed explanation**. Use this structure:

```
## TL;DR

**What:** One sentence — what does this change?
**Why:** One sentence — why is it needed?
**How:** One sentence — what's the approach?

## What

Detailed description of the change. What files, modules, or systems are affected?

## Why

The motivation. What problem does this solve? What was broken, missing, or suboptimal?
Link issues where applicable: `Closes #123`

## How

The approach. How does the implementation work? What were the key decisions?
If this is a non-trivial change, explain the design and any alternatives you considered.
```

### Requirements

- **CI must pass.** If your PR breaks tests, fix them before requesting review.
- **One concern per PR.** A bug fix is a bug fix. A feature is a feature. Don't bundle unrelated changes.
- **No drive-by formatting.** Don't reformat code you didn't change. Don't reorder imports in files you're not modifying.
- **Link issues when relevant.** Not mandatory for every PR, but if an issue exists, reference it.

### Change type checklist

Include in your PR:

- [ ] `feat` — New feature or capability
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code restructuring (no behavior change)
- [ ] `test` — Adding or updating tests
- [ ] `docs` — Documentation only
- [ ] `chore` — Build, CI, or tooling changes

### Breaking changes

If your PR changes any public API, CLI behavior, config format, or file structure, say so explicitly. Breaking changes need extra scrutiny and may need migration guidance.

## AI-assisted contributions

AI-generated PRs are first-class citizens here. We welcome them. We just ask for transparency:

- **Disclose it.** Note that the PR is AI-assisted in your description.
- **Test it.** AI-generated code must be tested to the same standard as human-written code. "The AI said it works" is not a test plan.
- **Understand it.** You should be able to explain what the code does and why. If a reviewer asks a question, "I'll ask the AI" is not an answer.

AI PRs go through the same review process as any other PR. No special treatment in either direction.

## Architecture guidelines

Before writing code, understand these principles:

- **Extension-first.** Can this be an extension instead of a core change? If yes, build it as an extension.
- **Simplicity wins.** Don't add abstractions, helpers, or utilities for one-time operations. Don't design for hypothetical future requirements.
- **Tests are the contract.** Changed behavior? The test suite tells you what you broke.

See [VISION.md](VISION.md) for the full list of what we won't accept.

## Scope areas

The codebase is organized into these areas. All are open to contributions:

| Area | Path | Notes |
|------|------|-------|
| Terminal UI | `pi-tui` | Components, themes, rendering |
| AI/LLM layer | `pi-ai` | Provider integrations, model handling |
| Agent core | `pi-agent-core` | Agent orchestration — RFC required for changes |
| Coding agent | `pi-coding-agent` | The main coding agent |
| GSD extension | `src/resources/extensions/gsd/` | GSD workflow — RFC required for auto-mode |
| Native bindings | `native/` | Platform-specific native code |
| CI/Build | `.github/`, `scripts/` | Workflows, build scripts |

## Review process

PRs go through automated review first, then human review. To help us review efficiently:

- Keep PRs focused and reasonably sized. Massive PRs take longer to review and are more likely to be sent back.
- Respond to review comments. If you disagree, explain why — discussion is welcome.
- If your PR has been open for a while without review, ping in Discord. We're a small team and things slip.

## Local development

```bash
# Install dependencies
npm ci

# Build
npm run build

# Run tests
npm test

# Type check
npx tsc --noEmit
```

CI must pass before your PR will be reviewed. Run these locally to save time.

## Security

If you find a security vulnerability, **do not open a public issue.** Email the maintainers directly or use GitHub's private vulnerability reporting. See the supply chain attack on GSD-1 (PR #1232) for why this matters.

## Questions?

Open a discussion on GitHub or ask in the Discord `#maintainers` channel.
