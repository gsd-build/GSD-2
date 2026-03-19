# Vision

GSD-2 is the orchestration layer between you and AI coding agents. It handles planning, execution, verification, and shipping so you can focus on what to build, not how to wrangle the tools.

## Who it's for

Anyone who codes with AI agents — solo developers shipping faster, open-source maintainers handling scale, vibe coders who think in outcomes. GSD adapts to skill level and workflow.

## Principles

**Extension-first.** If it can be an extension, it should be. Core stays lean. New capabilities belong in extensions, skills, and plugins unless they fundamentally require core integration.

**Simplicity over abstraction.** The codebase was aggressively cleaned up. Every line earns its place. Don't add helpers, utilities, or abstractions unless they eliminate real duplication or solve a real problem. Three similar lines of code is better than a premature abstraction.

**Tests are the contract.** If you change behavior, the tests tell you what you broke. Write tests for new behavior. Trust the test suite.

**Ship fast, fix fast.** Get it out, iterate quickly, don't let perfect be the enemy of good. Every release should work, but we'd rather ship and patch than delay and accumulate.

**Provider-agnostic.** GSD works with any LLM provider. No architectural decisions should privilege one provider over another.

## What we won't accept

These save everyone time. Don't open PRs for:

- **Enterprise patterns.** Dependency injection containers, abstract factories, strategy-pattern-for-the-sake-of-it, over-engineered config systems. This is a CLI tool, not a Spring application.

- **Framework swaps.** Rewriting working code in a different library or framework without a clear, measurable improvement in performance or maintainability. "I prefer X" is not sufficient motivation.

- **Cosmetic refactors.** Renaming variables to your preferred style, reordering imports, reformatting code that works. This is pure churn that creates merge conflicts and review burden for zero user value.

- **Complexity without user value.** If a change adds abstraction, indirection, or configuration but doesn't improve something a user can see or feel, it doesn't belong here.

- **Heavy orchestration layers.** Don't duplicate what the agent infrastructure already provides. Build on top of it, don't wrap it.

## Relationship to GSD-1

GSD-2 is the future. GSD-1 continues to serve its community but GSD-2 is where active development, new features, and architectural investment happen. The goal is to eventually migrate GSD-1 users to GSD-2.
