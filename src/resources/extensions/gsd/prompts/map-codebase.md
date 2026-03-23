You are analyzing a codebase to produce structured documentation.

## Focus Areas

{{focusDescriptions}}

## Working Directory

`{{workingDirectory}}`

## Output Directory

Write one markdown file per focus area to: `{{outputDirectory}}/`

- `TECH.md` — Technology stack analysis
- `ARCH.md` — Architecture patterns analysis
- `QUALITY.md` — Code quality assessment
- `CONCERNS.md` — Risk areas and concerns

Only produce files for the requested focus areas: {{focusAreas}}

## Instructions

1. Explore the codebase systematically:
   - Read package.json, tsconfig.json, and build configs
   - Examine the directory structure
   - Read key source files to understand patterns
   - Check test coverage and CI configuration
2. For each focus area, write a comprehensive markdown document with:
   - Executive summary (3-5 bullet points)
   - Detailed findings organized by topic
   - Specific file references (path:line where relevant)
   - Recommendations (if any)
3. Be factual — cite specific files, dependencies, and patterns you observe
4. Do not speculate about code you haven't read

### Format

Each output file should follow this structure:

```markdown
# [Area] Analysis

## Summary
- Key finding 1
- Key finding 2
- ...

## Detailed Findings

### [Topic]
[Description with file references]

### [Topic]
[Description with file references]

## Recommendations
- Recommendation 1
- Recommendation 2
```

{{skillActivation}}
