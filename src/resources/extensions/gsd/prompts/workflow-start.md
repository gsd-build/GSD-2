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

Follow the workflow defined below. Execute each phase in order, completing one before moving to the next. At each phase gate, confirm with the user before proceeding.

{{workflowContent}}

## Execution Rules

1. **Follow the phases in order.** Do not skip phases unless the workflow explicitly allows it.
2. **Artifact discipline.** If an artifact directory is specified, write all planning/summary documents there.
3. **Atomic commits.** Commit working code after each meaningful change. Use conventional commit format: `<type>(<scope>): <description>`.
4. **Verify before shipping.** Run the project's test suite and build before marking the workflow complete.
5. **Gate between phases.** After each phase, summarize what was done and ask the user to confirm before moving to the next phase.
6. **Stay focused.** This is a {{complexity}}-complexity workflow. Match your ceremony level to the task — don't over-engineer or under-deliver.
