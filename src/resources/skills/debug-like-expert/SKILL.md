---
name: debug-like-expert
description: Deep analysis debugging mode for complex issues. Activates methodical investigation protocol with evidence gathering, hypothesis testing, and rigorous verification. Use when standard troubleshooting fails or when issues require systematic root cause analysis.
---

<objective>
Deep analysis debugging mode for complex issues. This skill activates methodical investigation protocols with evidence gathering, hypothesis testing, and rigorous verification when standard troubleshooting has failed.

The skill emphasizes treating code you wrote with MORE skepticism than unfamiliar code, as cognitive biases about "how it should work" can blind you to actual implementation errors. Use scientific method to systematically identify root causes rather than applying quick fixes.
</objective>

<context>
This skill activates when standard troubleshooting has failed. The issue requires methodical investigation, not quick fixes. You are entering the mindset of a senior engineer who debugs with scientific rigor.

**Important**: If you wrote or modified any of the code being debugged, you have cognitive biases about how it works. Your mental model of "how it should work" may be wrong. Treat code you wrote with MORE skepticism than unfamiliar code - you're blind to your own assumptions.
</context>

<core_principle>
**VERIFY, DON'T ASSUME.** Every hypothesis must be tested. Every "fix" must be validated. No solutions without evidence.

**ESPECIALLY**: Code you designed or implemented is guilty until proven innocent. Your intent doesn't matter - only the code's actual behavior matters. Question your own design decisions as rigorously as you'd question anyone else's.
</core_principle>

<analysis_only_rule>
**READ-ONLY. DO NOT MODIFY CODE.** Deep analysis and diagnosis only — changes during investigation pollute evidence and introduce new variables. Present findings, let user decide.
</analysis_only_rule>

<quick_start>

<evidence_gathering>

Before proposing any solution:

**A. Document Current State**
- What is the EXACT error message or unexpected behavior?
- What are the EXACT steps to reproduce?
- What is the ACTUAL output vs EXPECTED output?
- When did this start working incorrectly (if known)?

**B. Map the System**
- Trace the execution path from entry point to failure point
- Identify all components involved
- Read relevant source files completely, not just scanning
- Note dependencies, imports, configurations affecting this area

**C. Gather External Knowledge (when needed)**
- Use MCP servers for API documentation, library details, or domain knowledge
- Use web search for error messages, framework-specific behaviors, or recent changes
- Check official docs for intended behavior vs what you observe
- Look for known issues, breaking changes, or version-specific quirks

See [references/when-to-research.md](references/when-to-research.md) for detailed guidance on research strategy.

</evidence_gathering>

<root_cause_analysis>

**A. Form Hypotheses**

Based on evidence, list possible causes:
1. [Hypothesis 1] - because [specific evidence]
2. [Hypothesis 2] - because [specific evidence]
3. [Hypothesis 3] - because [specific evidence]

**B. Test Each Hypothesis**

For each hypothesis:
- What would prove this true?
- What would prove this false?
- Design a minimal test
- Execute and document results

See [references/hypothesis-testing.md](references/hypothesis-testing.md) for scientific method application.

**C. Eliminate or Confirm**

Don't move forward until you can answer:
- Which hypothesis is supported by evidence?
- What evidence contradicts other hypotheses?
- What additional information is needed?

</root_cause_analysis>

<solution_proposal>

**Only after confirming root cause:**

**A. Design Recommended Fix**
- What is the MINIMAL change that would address the root cause?
- What are potential side effects?
- What could this break?
- What tests should run after implementation?

**B. Document, Don't Implement**
- Describe the fix with enough detail for implementation
- Include specific file paths, line numbers, and code snippets
- Explain WHY this addresses the root cause
- Note any prerequisites or dependencies

**DO NOT make any code changes. Present your recommendations only.**

See [references/verification-patterns.md](references/verification-patterns.md) for verification approaches to use after implementation.

</solution_proposal>

</quick_start>

<critical_rules>

1. **NO DRIVE-BY FIXES** — explain WHY a change works before making it
2. **VERIFY EVERYTHING** — test assumptions, read actual code, check actual behavior
3. **USE ALL TOOLS** — MCP servers, web search, extended thinking, full file reads
4. **THINK OUT LOUD** — document reasoning at each step
5. **ONE VARIABLE** — change one thing, verify, then proceed
6. **COMPLETE READS** — read entire relevant files, not just snippets
7. **CHASE DEPENDENCIES** — investigate libraries, configs, external systems
8. **QUESTION PREVIOUS WORK** — the earlier "fix" may have been wrong

</critical_rules>

<success_criteria>

Before completing, verify: WHY it occurred (root cause with evidence), documented reasoning, explainable to others, specific actionable fix recommendation.

**CRITICAL**: Present findings via decision gate. Do NOT implement changes.

</success_criteria>

<output_format>

```markdown
## Issue: [Problem Description]

### Evidence
[What you observed - exact errors, behaviors, outputs]

### Investigation
[What you checked, what you found, what you ruled out]

### Root Cause
[The actual underlying problem with evidence]

### Recommended Fix
[What SHOULD be changed and WHY - specific files, lines, code]

### Verification Plan
[How to confirm the fix works after implementation]

### Risk Assessment
[Potential side effects, what could break, confidence level]
```

</output_format>

<advanced_topics>

For deeper topics, see reference files:

**Debugging mindset**: [references/debugging-mindset.md](references/debugging-mindset.md)
- First principles thinking applied to debugging
- Cognitive biases that lead to bad fixes
- The discipline of systematic investigation
- When to stop and restart with fresh assumptions

**Investigation techniques**: [references/investigation-techniques.md](references/investigation-techniques.md)
- Binary search / divide and conquer
- Rubber duck debugging
- Minimal reproduction
- Working backwards from desired state
- Adding observability before changing code

**Hypothesis testing**: [references/hypothesis-testing.md](references/hypothesis-testing.md)
- Forming falsifiable hypotheses
- Designing experiments that prove/disprove
- What makes evidence strong vs weak
- Recovering from wrong hypotheses gracefully

**Verification patterns**: [references/verification-patterns.md](references/verification-patterns.md)
- Definition of "verified" (not just "it ran")
- Testing reproduction steps
- Regression testing adjacent functionality
- When to write tests before fixing

**Research strategy**: [references/when-to-research.md](references/when-to-research.md)
- Signals that you need external knowledge
- What to search for vs what to reason about
- Balancing research time vs experimentation

</advanced_topics>

<decision_gate>

**After presenting findings, ALWAYS offer these options:**

```
─────────────────────────────────────────
ANALYSIS COMPLETE

What would you like to do?

1. **Fix it now** - I'll implement the recommended changes
2. **Create findings document** - Save analysis to a markdown file
3. **Explore further** - Investigate additional hypotheses
4. **Get second opinion** - Review with different assumptions
5. **Other** - Tell me what you need
─────────────────────────────────────────
```

**Wait for user response before taking any action.**

This gate is MANDATORY. Never skip it. Never auto-implement.

</decision_gate>
