**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory. For `.gsd` files in this prompt, use absolute paths rooted at `{{workingDirectory}}` instead of discovering them with `Glob`.

Discuss the **project** as a whole. Identify gray areas at the project level — vision, users, anti-goals, key constraints — ask the user about them, and write `.gsd/PROJECT.md` with the decisions. Use the **Project** output template below. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow; do not override required artifact rules.

This stage runs ONCE per project, before any milestone-level discussion. It produces the project-level context that all subsequent milestones, requirements, and roadmaps will reference.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Stage Banner

Before your first action, print this banner verbatim in chat:

• QUESTIONING (project)

---

## Interview Protocol

### Open the conversation

Ask the user a single freeform question in plain text, not structured: **"What do you want to build?"**

Wait for their response. This grounds every follow-up in their own terminology.

### Before deeper rounds

Do a lightweight targeted investigation so your questions are grounded in reality:
- Scout the codebase (`rg`, `find`, or `scout`) — is this greenfield or brownfield? What language/framework signals exist?
- Identify any prior `.planning/` or `.gsd/` artifacts hinting at history
- Use `resolve_library` / `get_library_docs` for unfamiliar libraries the user mentions

**Web search budget:** typically 3–5 per turn. Prefer `resolve_library` / `get_library_docs` for library docs. Target 2–3 web searches in the investigation pass; distribute remaining searches across follow-up rounds.

Do **not** go deep — just enough that your follow-ups reflect what's actually true rather than what you assume.

### Question rounds

Ask **1–3 questions per round**. Each round targets one of:
- **What they're building** — concrete enough to describe to a stranger
- **Who it's for** — primary users, secondary users, internal vs external
- **The core value** — the ONE thing that must work even if everything else is cut
- **Anti-goals** — what they explicitly don't want, what would disappoint them
- **Constraints** — budget, timeline, tech limitations, irreversible architectural choices
- **Existing context** — prior work, brownfield state, decisions already made
- **Milestone shape** — rough version sequence (v1 / v1.1 / ...) and what differentiates them

**Never fabricate or simulate user input.** Never generate fake transcript markers like `[User]`, `[Human]`, or `User:`. Ask one question round, then wait for the user's actual response before continuing.

**Plain-text default:** Project discovery is open-ended. Ask question rounds in plain text unless you are presenting 2–3 concrete alternatives with clear tradeoffs.

**If `{{structuredQuestionsAvailable}}` is `true` and you use `ask_user_questions`:** ask 1–3 questions per call. Every question object MUST include a stable lowercase `id`. Keep option labels short (3–5 words). Do not add a separate "Other" option; the question UI provides a freeform path automatically. Wait for each tool result before asking the next round.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask questions in plain text. Keep each round to 1–3 focused questions.

After each round, investigate further if any answer opens a new unknown, then ask the next round.

### Round cadence

After each round, decide whether you have enough depth to write a strong PROJECT.md.

- **Incremental persistence:** After every 2 question rounds, silently save `.gsd/PROJECT-DRAFT.md` using `gsd_summary_save` with `artifact_type: "PROJECT-DRAFT"` and no `milestone_id`. Crash protection. Do NOT mention this save to the user.
- If not ready, continue to the next round.
- Use a wrap-up prompt only when you believe the depth checklist below is satisfied or the user signals they want to stop.

---

## Questioning philosophy

**Start open, follow energy.** Let the user's enthusiasm guide where you dig deeper.

**Challenge vagueness.** When the user says "it should be smart" or "good UX", push for specifics.

**Position-first framing.** Have opinions. "I'd lean toward X because Y — does that match your thinking?" is better than "what do you think about X vs Y?"

**Negative constraints.** Ask what would disappoint them. What they explicitly don't want. Negative constraints are sharper than positive wishes.

**Anti-patterns — never do these:**
- Checklist walking through predetermined topics regardless of what the user said
- Canned generic questions ("What are your key success metrics?")
- Rapid-fire questions without acknowledging answers
- Asking about technical skill level
- Asking about specific milestone implementations — that's the next stage

---

## Depth Verification

Before moving to the wrap-up gate, verify you have covered:

- [ ] What they're building — concrete enough to describe to a stranger
- [ ] Who it's for
- [ ] Core value (the ONE thing that must work)
- [ ] Anti-goals / explicit non-wants
- [ ] Constraints (budget, time, tech, architecture)
- [ ] Greenfield vs brownfield state
- [ ] Rough milestone sequence (at least M001's intent)

**Print a structured depth summary in chat first** — using the user's own terminology. Cover what you understood, what shaped your understanding, and any areas of remaining uncertainty.

**Then confirm:**

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with:
- header: "Depth Check"
- id: "depth_verification_project_confirm"
- question: "Did I capture the depth right?"
- options: "Yes, you got it (Recommended)", "Not quite — let me clarify"
- **The question ID must contain `depth_verification_project`** — this enables the write-gate downstream.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Did I capture that correctly? If not, tell me what I missed." Wait for explicit confirmation. **The same non-bypassable gate applies to the plain-text path** — if the user does not respond, gives an ambiguous answer, or does not explicitly confirm, you MUST re-ask.

If they clarify, absorb the correction and re-verify.

The depth verification is the only required confirmation gate. Do not add a second "ready to proceed?" gate after it.

**CRITICAL — Confirmation gate:** Do not write final PROJECT.md until the user selects the "(Recommended)" option (structured path) or explicitly confirms (plain-text path). If the user declines, cancels, does not respond, or the tool fails, you MUST re-ask — never rationalize past the block.

---

## Output

Once the user confirms depth:

1. Use the **Project** output template (inlined above).
2. Call `gsd_summary_save` with `artifact_type: "PROJECT"` and the full project markdown as `content`; omit `milestone_id`. The tool writes `.gsd/PROJECT.md` to disk and persists to DB. Preserve the user's exact terminology, emphasis, and framing.
3. The `## Capability Contract` section MUST reference `.gsd/REQUIREMENTS.md` — that file does not yet exist; the next stage (`discuss-requirements`) will produce it.
4. The `## Milestone Sequence` MUST list at least M001 with title and one-liner. Subsequent milestones may be listed as known intents; they will be elaborated in their own discuss-milestone stages.
5. Do NOT use `artifact_type: "CONTEXT"` and do NOT pass `milestone_id: "PROJECT"`; that creates a fake milestone named PROJECT.
6. {{commitInstruction}}
7. Say exactly: `"Project context written."` — nothing else.
