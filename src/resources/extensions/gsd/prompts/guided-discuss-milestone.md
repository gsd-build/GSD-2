Discuss milestone {{milestoneId}} ("{{milestoneTitle}}"). Identify gray areas, ask the user about them, and write `{{milestoneId}}-CONTEXT.md` in the milestone directory with the decisions. Use the **Context** output template below. If a `GSD Skill Preferences` block is present in system context, use it to decide which skills to load and follow; do not override required artifact rules.

**Structured questions available: {{structuredQuestionsAvailable}}**

{{inlinedTemplates}}

---

## Interview Protocol

{{fastPathInstruction}}

### Before your first question round

Do a lightweight targeted investigation so your questions are grounded in reality:
- Scout the codebase (`rg`, `find`, or `scout`) to understand what already exists that this milestone touches or builds on
- Check the roadmap context above (if present) to understand what surrounds this milestone
- Use `resolve_library` / `get_library_docs` for unfamiliar libraries — prefer this over `search-the-web` for library documentation
- Identify the 3–5 biggest behavioural and architectural unknowns: things where the user's answer will materially change what gets built

**Web search budget:** You have a limited number of web searches per turn (typically 3-5). Prefer `resolve_library` / `get_library_docs` for library documentation and `search_and_read` for one-shot topic research — they are more budget-efficient. Target 2-3 web searches in the investigation pass. Distribute remaining searches across subsequent question rounds rather than clustering them.

Do **not** go deep — just enough that your questions reflect what's actually true rather than what you assume.

### Mandatory first round: Pain and Priority

Your **first question round** must establish the Milestone Intent — the pipeline-persistent core that every downstream agent will see. Ask:

1. **"What do you do TODAY that you should NOT have to do after this milestone?"** — The concrete behavioral pain being eliminated. Not features to build, but friction to remove. Push for a single sentence that a stranger would understand.
2. **"Of everything we've discussed — what is the absolute KERN? If only ONE thing ships, which one?"** — Force a priority stack. The user's answer defines what is non-negotiable vs. nice-to-have.
3. **"What does success FEEL like? Describe the moment after this ships."** — Concrete behavioral delta, not abstract outcomes.

Write the user's answers into the `## Milestone Intent` section of CONTEXT.md. This section survives into every downstream prompt — planner, executor, completer. It must be concise (~500 chars), honest, and use the user's exact words.

Also determine the **milestone class**: Is this a `feature` milestone (adding new capabilities to an existing workflow) or a `transformation` milestone (changing how the system behaves — the user's workflow itself is different afterward)? Transformation milestones may produce less visible UI but more behavioral change. Write this into the CONTEXT.md frontmatter as `milestone_class`.

### Subsequent question rounds

Ask **1–3 questions per round**. Keep each question focused on one of:
- **What they're building** — concrete enough to explain to a stranger
- **Why it needs to exist** — the problem it solves or the desire it fulfills
- **Who it's for** — user, team, themselves
- **What "done" looks like** — observable outcomes, not abstract goals
- **The biggest technical unknowns / risks** — what could fail, what hasn't been proven
- **What external systems/services this touches** — APIs, databases, third-party services

**Never fabricate or simulate user input.** Never generate fake transcript markers like `[User]`, `[Human]`, or `User:`. Ask one question round, then wait for the user's actual response before continuing.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` for each round. 1–3 questions per call, each as a separate question object. Keep option labels short (3–5 words). Always include a freeform "Other / let me explain" option. When the user picks that option or writes a long freeform answer, switch to plain text follow-up for that thread before resuming structured questions. **IMPORTANT: Call `ask_user_questions` exactly once per turn. Never make multiple calls with the same or overlapping questions — wait for the user's response before asking the next round.**

**If `{{structuredQuestionsAvailable}}` is `false`:** ask questions in plain text. Keep each round to 1–3 focused questions. Wait for answers before asking the next round.

After the user answers, investigate further if any answer opens a new unknown, then ask the next round.

### Round cadence

After each round of answers, decide whether you already have enough depth to write a strong context file.

- **Incremental persistence:** After every 2 question rounds, silently save a `{{milestoneId}}-CONTEXT-DRAFT.md` with your current understanding using `gsd_summary_save` with `artifact_type: "CONTEXT-DRAFT"`. This protects against session crashes losing all confirmed work. Do NOT mention this save to the user — it's invisible bookkeeping. The final context file will overwrite it.
- If not ready, investigate any newly-opened unknowns and continue to the next round immediately. Do **not** ask a meta "ready to wrap up?" question after every round.
- Use a single wrap-up prompt only when you genuinely believe the depth checklist is satisfied or the user signals they want to stop.
- **If `{{structuredQuestionsAvailable}}` is `true` and you need that wrap-up prompt:** use `ask_user_questions` with options:
  - "Write the context file" *(recommended when depth is satisfied)*
  - "One more pass"
- **If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text only once you believe you are ready to write.

---

## Questioning philosophy

**Start open, follow energy.** Let the user's enthusiasm guide where you dig deeper.

**Challenge vagueness, make abstract concrete.** When the user says something abstract ("it should be smart" / "good UX"), push for specifics.

**Lead with experience, but ask implementation when it materially matters.** Default questions should target the experience and outcome. But when implementation choices materially change scope, proof, compliance, integration, deployment, or irreversible architecture, ask them directly instead of forcing a fake UX phrasing.

**Position-first framing.** Have opinions. "I'd lean toward X because Y — does that match your thinking?" is better than "what do you think about X vs Y?"

**Negative constraints.** Ask what would disappoint them. What they explicitly don't want. Negative constraints are sharper than positive wishes.

**Anti-patterns — never do these:**
- Checklist walking through predetermined topics regardless of what the user said
- Canned generic questions that could apply to any project
- Corporate speak ("What are your key success metrics?")
- Rapid-fire questions without acknowledging answers
- Asking about technical skill level

---

## Dense Input Processing Protocol

When the user's initial input exceeds ~2000 words, references external documents (research reports, voice transcripts, chat exports), or spans multiple distinct topics — activate the full structured decomposition BEFORE any question rounds. This is not optional for dense inputs — without it, the discussion drifts toward the first topics mentioned and later topics are lost.

### Step 1: Full Ingestion

Read the ENTIRE input before any analysis. If the user references external files (research reports, voice exploration transcripts, chat exports), read those files too.

**Context window management for large external files:**
- Files under 30K chars: read in full
- Files 30K-80K chars: read in 2-3 chunks using `read` with `offset`/`limit`, extract key themes and decisions from each chunk before moving to the next
- Files over 80K chars: use `subagent` with `scout` agent to produce a structured summary: `{ agent: "scout", task: "Read [filepath] and extract: (1) all distinct topics/domains discussed, (2) key decisions made, (3) stated priorities and pain points, (4) technical constraints mentioned. Output as structured markdown." }` Then read the scout's summary instead of the full file.
- When multiple large files exist: process them sequentially, not all at once. Extract domains and items from each before combining.

**Anti-pattern:** Reading the first 3 paragraphs of a 143K file, forming an opinion, then never reading the rest. If you can't read the whole file, delegate to scout — don't silently skip content.

Do NOT start categorizing or responding while reading — this creates attention bias toward early segments.

### Step 2: Domain Detection

Identify each distinct topic domain the input touches. A domain is a coherent area of concern (e.g., "context transfer elimination", "pipeline visibility", "knowledge graph integration", "user-facing UX"). Dense inputs from founders commonly span 3-8 domains.

For each domain, note:
- Which segments/paragraphs of the input it appears in
- How much emphasis the user gives it (repetition = priority signal, not redundancy)
- Whether it connects to other domains

### Step 3: Item Extraction per Domain

Within each domain, extract individual items. Tag each:
- **CLEAR** — explicitly stated with specific intent
- **INTERPRETED** — reasonable inference from context
- **UNCERTAIN** — ambiguous, needs clarification

Preserve the user's exact terminology. "Unified Layer" stays "Unified Layer" — don't paraphrase to "abstraction layer." Emotional weight matters: "das MUSS", "essentiell", repetition across segments = high priority signal.

### Step 4: Cross-Domain Links

Identify connections between domains. When the user says "this connects to..." or when items in different domains share dependencies, record the link. These links often reveal the user's mental model of how everything fits together — they are more valuable than individual items.

### Step 5: Strategic Thesis

Synthesize a single thesis (2-3 sentences) that captures the user's overarching intent across ALL domains. Use their terminology. This thesis answers: "What is this person REALLY trying to achieve, and why does it matter to them?"

### Step 6: Present "Was ich vernommen habe"

Present the decomposition to the user for confirmation. Format:

```
## What I See

**Strategic Thesis:** [2-3 sentences in user's terminology]

**Domains:**
1. [Domain A] — [X items] — [brief summary]
2. [Domain B] — [Y items] — [brief summary]
...

**Cross-Domain Links:**
- [Domain A] ↔ [Domain B]: [connection]

**Priority Signals I Detected:**
- [What the user emphasized, repeated, or marked as essential]

**Items I'm UNCERTAIN About:**
- [Item]: [what's unclear, specific question to resolve it]
```

**If `{{structuredQuestionsAvailable}}` is `true`:** After presenting, use `ask_user_questions` with header "Domain Check", question "Did I capture the full landscape? Are domains and priorities correct?", options "Yes, you captured it (Recommended)" / "Missing domains or wrong priorities — let me clarify". Then present uncertain items for resolution.

**If `{{structuredQuestionsAvailable}}` is `false`:** Present in plain text and ask for confirmation before proceeding.

**Critical rule:** Do NOT proceed to question rounds until the user confirms the decomposition captures the full landscape. Missing a domain at this stage means it will be absent from the entire downstream pipeline.

### Step 6.5: Progressive Checkpoint (Anti-Compaction Safety)

After the user confirms the domain decomposition and before moving to focused question rounds, persist the current understanding to disk. This protects against context window compaction — if the session is long and complex, the agent's context may be summarized, losing early details. The checkpoint ensures the decomposition survives.

Write a checkpoint file to the milestone directory:

```bash
mkdir -p .gsd/milestones/{{milestoneId}}/
```

Write `{{milestoneId}}-DISCUSSION-CHECKPOINT.md` with:
- The confirmed domain decomposition (domains, items, cross-domain links)
- The strategic thesis
- The Pain/KERN/Success answers from the mandatory first round
- Any confirmed items from question rounds so far

This file is a **working document** — it will be superseded by the final CONTEXT.md. Its purpose is purely compaction-safety: if the agent's context window fills up during later question rounds, it can re-read this checkpoint to recover the decomposition.

**Incremental update rule:** Update the checkpoint file after EVERY question round — not just after 5 rounds. Each update overwrites the file with the full current state: domains + items + cross-domain links + thesis + all confirmed answers so far. This is cheap (one file write) and ensures that if compaction happens between any two rounds, no user answer is lost. The pattern is:

1. User answers question round N
2. Agent processes the answer
3. Agent writes updated checkpoint (appending the new confirmed items/decisions)
4. Agent presents question round N+1

This is the closest approximation to GSD1's IIP (Incremental Input Persistence) within the current architecture. The checkpoint file is the rolling truth — if the agent ever feels uncertain about what was discussed earlier, it can re-read the checkpoint instead of relying on potentially compacted chat history.

### Step 7: Focused Question Rounds (Post-Decomposition)

Now run the question rounds from above — but INFORMED by the decomposition. Questions should target:
- Uncertain items that need resolution
- Gaps between domains (what's not connected but should be?)
- Priority conflicts (domain A wants X but domain B implies not-X)
- Scope decisions (which domains are in this milestone vs. future work?)

### Lightweight Path

For inputs under ~2000 words that don't reference external documents: skip the full decomposition. Use the mandatory first round (Pain + Priority) and subsequent question rounds directly. Research calibration still runs.

### Research Calibration

After the decomposition and question rounds, recommend a `research_depth` tier — `skip`, `light`, `standard`, or `deep` — with a brief argument. Confirm via `ask_user_questions`. Write confirmed values into CONTEXT.md frontmatter: `research_depth`, `research_signals`, `research_focus`.

---

## Depth Verification

Before writing context, verify understanding across three dimensions in sequence. Each gets its own summary + confirmation.

### Dimension 1: What (`depth_verification_what`)

Print a concise summary (3–5 bullets) of what they're building, why it exists, who it's for, and what "done" looks like — using their terminology.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "What Check", question "Did I capture the what correctly?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify". **The question ID must contain `depth_verification_what` and the milestone id** (e.g. `depth_verification_what_{{milestoneId}}`) — this enables the write-gate downstream and keeps verification scoped to the milestone being discussed.

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Did I capture that correctly? If not, tell me what I missed." Wait for explicit confirmation before proceeding. **The same non-bypassable gate applies to the plain-text path** — if the user does not respond, gives an ambiguous answer, or does not explicitly confirm, you MUST re-ask. Never rationalize past a missing confirmation.

### Dimension 2: Risks (`depth_verification_risks`)

Print a concise summary (3–5 bullets) of technical unknowns, risks, unproven assumptions, and failure modes.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Risks Check", question "Did I identify the key risks?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify", ID containing `depth_verification_risks`.

### Dimension 3: Dependencies (`depth_verification_dependencies`)

Print a concise summary (3–5 bullets) of external systems, APIs, services, integration points, and deployment constraints.

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Deps Check", question "Did I capture the dependencies correctly?", options "Yes, you got it (Recommended)" / "Not quite — let me clarify", ID containing `depth_verification_dependencies`.

### Dimension 4: Intent (`depth_verification_intent`)

This is the most critical dimension. Print a compact summary of the **Milestone Intent** you will write:

- **Core Problem Being Eliminated:** one sentence — what the user does today that stops after this milestone
- **Priority Stack:** KERN item + 1-2 supporting items — do they match the user's actual pain hierarchy?
- **Success Feels Like:** 1-2 concrete behavioral deltas
- **Milestone Class:** feature or transformation — with brief justification

**If `{{structuredQuestionsAvailable}}` is `true`:** use `ask_user_questions` with header "Intent Check", question "Is this the right core problem and priority order? This is what every downstream agent will see.", options "Yes, nail it (Recommended)" / "Not quite — the real pain is different", ID containing `depth_verification_intent`.

**If `{{structuredQuestionsAvailable}}` is `false`:** present the Intent summary in plain text and ask: "Is this the right core problem and priority order? This is what every downstream agent will see — planner, executor, validator. If the priority is wrong here, everything downstream will drift."

**Why this dimension exists:** The Milestone Intent is the pipeline-persistent core — it is injected into every downstream prompt. If it captures the wrong pain or the wrong priority order, every subsequent agent optimizes for the wrong thing. This dimension is the last gate before the Intent is locked.

### Re-verification

If the user says "not quite" on any dimension, absorb the correction and re-verify **that dimension only**. All four must pass before CONTEXT.md can be written.

After all four dimensions pass, write a **final checkpoint update** that includes the verified dimension summaries. This ensures the depth verification results survive even if compaction happens before the CONTEXT.md write.

**CRITICAL — Non-bypassable gate:** The system mechanically blocks CONTEXT.md writes until the user selects the "(Recommended)" option (structured path) or explicitly confirms (plain-text path). If the user declines, cancels, does not respond, or the tool fails, you MUST re-ask — never rationalize past the block ("tool not responding, I'll proceed" is forbidden). The gate exists to protect the user's work; treat a block as an instruction, not an obstacle to work around.

---

## Output

Once the user confirms depth:

1. **Re-read the checkpoint** (`{{milestoneId}}-DISCUSSION-CHECKPOINT.md`) before writing CONTEXT.md — this is your compaction-safe source of truth for everything discussed. If your chat history feels incomplete or summarized, the checkpoint has the authoritative state.
2. Use the **Context** output template below
3. `mkdir -p` the milestone directory if needed
4. **Seed Material:** If the user referenced external documents (research reports, voice transcripts, chat exports) during the discussion, include a `## Seed Material` section in CONTEXT.md with file paths and brief descriptions of what each contains. This section tells the downstream planner which files to read for depth that CONTEXT.md summarizes but cannot fully capture. Omit the section entirely if no external documents were referenced.
5. Call `gsd_summary_save` with `milestone_id: {{milestoneId}}`, `artifact_type: "CONTEXT"`, and the full context markdown as `content` — the tool writes the file to disk and persists to DB. Preserve the user's exact terminology, emphasis, and framing in the content. Do not paraphrase nuance into generic summaries. The context file is downstream agents' only window into this conversation.
6. {{commitInstruction}}
7. Say exactly: `"{{milestoneId}} context written."` — nothing else.
