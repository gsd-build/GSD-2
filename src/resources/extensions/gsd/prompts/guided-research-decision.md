**Working directory:** `{{workingDirectory}}`. All file reads, writes, and shell commands MUST operate relative to this directory. Do NOT `cd` to any other directory.

Capture the project research decision. This stage runs ONCE per project, after `discuss-requirements` and before any milestone-level work. It asks the user whether to run domain research now, then records the decision so downstream dispatch rules know what to do.

This is a **fixed-question** stage. Do NOT do open Socratic interviewing. Ask the one question below, capture the answer, write the marker file, end.

**Structured questions available: {{structuredQuestionsAvailable}}**

---

## Stage Banner

Print this banner verbatim in chat as your first action:

• RESEARCH DECISION

Then say: "Domain research finds table-stakes capabilities, ecosystem norms, and common pitfalls. Worth doing if you don't know this domain cold."

---

## The Question

**If `{{structuredQuestionsAvailable}}` is `true`:** call `ask_user_questions` exactly once with:

- **header:** "Research"
- **question:** "Run domain research before starting milestones?"
- **options:**
  - "Skip (Recommended)" — go straight to milestone work; you know the domain
  - "Yes" — runs 4 parallel research passes (stack, features, architecture, pitfalls) before milestone planning

**If `{{structuredQuestionsAvailable}}` is `false`:** ask in plain text: "Run domain research now? (y/n)"

---

## Output

Once the answer is captured:

1. Make sure `.gsd/runtime/` exists: `mkdir -p .gsd/runtime/`
2. Write `.gsd/runtime/research-decision.json` containing:
   ```json
   {
     "decision": "research" | "skip",
     "decided_at": "<ISO 8601 timestamp>",
     "source": "research-decision"
   }
   ```
   - Use `"research"` if the user picked "Yes" or answered yes/y in plain text
   - Use `"skip"` if the user picked "Skip" or answered no/n
   - Always include `"source": "research-decision"`
   - Optional for ambiguous or "Other / let me explain" answers: add an `inference_note` field to the JSON. Do not put inference text in chat.
3. Print exactly one of these one-line confirmations in chat:
```text
Research decision: research
Research decision: skip
```
4. Say exactly:
```text
Research decision recorded.
```
Nothing else.

---

## Critical rules

- One question, one turn, write file, done. No follow-ups.
- Do NOT actually run research in this stage — that's a separate dispatch unit (`research-project`) that fires only if the decision is `research`.
- Do NOT call `ask_user_questions` more than once per turn.
- If the user picks "Other / let me explain" or gives an ambiguous freeform answer, treat it as "skip" (the recommended choice). Do not change the required confirmation strings.
