# Workflow Template: {{templateName}}

You are executing a **{{templateName}}** workflow (template: `{{templateId}}`).

## Context

- **Description:** {{description}}
- **Issue reference:** {{issueRef}}
- **Date:** {{date}}
- **Branch:** {{branch}}
- **Artifact directory:** {{artifactDir}}
- **Phases:** {{phases}}
- **Complexity:** {{complexity}}

## Workflow Definition

Follow the workflow defined below. Execute each phase in order, completing one before moving to the next. For low and medium complexity workflows, keep moving by default — pause only at true decision gates (user must choose between materially different directions, outward-facing actions need approval, or the workflow explicitly requires a human checkpoint). For high complexity workflows, confirm at phase transitions unless the workflow explicitly marks a gate as skip-safe.

{{workflowContent}}

## Execution Rules

1. **Follow the phases in order.** Do not skip phases unless the workflow explicitly allows it.
2. **Artifact discipline.** If an artifact directory is specified, write all planning/summary documents there.
3. **Atomic commits.** Commit working code after each meaningful change. Use conventional commit format: `<type>(<scope>): <description>`.
4. **Verify before shipping.** Run the project's test suite and build before marking the workflow complete.
5. **Decision gates, not ceremony.** After each phase, summarize what changed. For low/medium complexity, ask for confirmation only when the next phase depends on a real user choice or external approval. For high complexity, confirm before proceeding to each new phase.
6. **Stay focused.** This is a {{complexity}}-complexity workflow. Match your ceremony level to the task — don't over-engineer or under-deliver.
