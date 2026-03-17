const SUBCOMMAND_HELP: Record<string, string> = {
  config: [
    'Usage: gsd config',
    '',
    'Re-run the interactive setup wizard to configure:',
    '  - LLM provider (Anthropic, OpenAI, Google, etc.)',
    '  - Web search provider (Brave, Tavily, built-in)',
    '  - Remote questions (Discord, Slack, Telegram)',
    '  - Tool API keys (Context7, Jina, Groq)',
    '',
    'All steps are skippable and can be changed later with /login or /search-provider.',
  ].join('\n'),

  update: [
    'Usage: gsd update',
    '',
    'Update GSD to the latest version.',
    '',
    'Equivalent to: npm install -g gsd-pi@latest',
  ].join('\n'),

  sessions: [
    'Usage: gsd sessions',
    '',
    'List all saved sessions for the current directory and interactively',
    'pick one to resume. Shows date, message count, and a preview of the',
    'first message for each session.',
    '',
    'Sessions are stored per-directory, so you only see sessions that were',
    'started from the current working directory.',
    '',
    'Compare with --continue (-c) which always resumes the most recent session.',
  ].join('\n'),

  headless: [
    'Usage: gsd headless [flags] [command] [args...]',
    '',
    'Run /gsd commands without the TUI. Default command: auto',
    '',
    'Flags:',
    '  --timeout N          Overall timeout in ms (default: 300000)',
    '  --json               JSONL event stream to stdout',
    '  --model ID           Override model',
    '',
    'Commands:',
    '  auto                 Run all queued units continuously (default)',
    '  next                 Run one unit',
    '  status               Show progress dashboard',
    '  new-milestone        Create a milestone from a specification document',
    '  query <target>       Read-only state inspection (no LLM, instant)',
    '',
    'query targets:',
    '  phase                Full derived state as JSON',
    '  cost                 Aggregated parallel worker costs',
    '  progress             Milestone/slice/task progress + registry',
    '  next                 Preview next unit to dispatch (dry-run)',
    '',
    'new-milestone flags:',
    '  --context <path>     Path to spec/PRD file (use \'-\' for stdin)',
    '  --context-text <txt> Inline specification text',
    '  --auto               Start auto-mode after milestone creation',
    '  --verbose            Show tool calls in progress output',
    '',
    'Examples:',
    '  gsd headless                                    Run /gsd auto',
    '  gsd headless next                               Run one unit',
    '  gsd headless --json status                      Machine-readable status',
    '  gsd headless --timeout 60000                    With 1-minute timeout',
    '  gsd headless new-milestone --context spec.md    Create milestone from file',
    '  cat spec.md | gsd headless new-milestone --context -   From stdin',
    '  gsd headless new-milestone --context spec.md --auto    Create + auto-execute',
    '  gsd headless query phase                        Instant JSON state dump',
    '  gsd headless query next                         Preview next dispatch',
    '  gsd headless query cost                         Aggregate worker costs',
    '',
    'Exit codes: 0 = complete, 1 = error/timeout, 2 = blocked',
  ].join('\n'),
}

export function printHelp(version: string): void {
  process.stdout.write(`GSD v${version} — Get Shit Done\n\n`)
  process.stdout.write('Usage: gsd [options] [message...]\n\n')
  process.stdout.write('Options:\n')
  process.stdout.write('  --mode <text|json|rpc|mcp> Output mode (default: interactive)\n')
  process.stdout.write('  --print, -p              Single-shot print mode\n')
  process.stdout.write('  --continue, -c           Resume the most recent session\n')
  process.stdout.write('  --model <id>             Override model (e.g. claude-opus-4-6)\n')
  process.stdout.write('  --no-session             Disable session persistence\n')
  process.stdout.write('  --extension <path>       Load additional extension\n')
  process.stdout.write('  --tools <a,b,c>          Restrict available tools\n')
  process.stdout.write('  --list-models [search]   List available models and exit\n')
  process.stdout.write('  --version, -v            Print version and exit\n')
  process.stdout.write('  --help, -h               Print this help and exit\n')
  process.stdout.write('\nSubcommands:\n')
  process.stdout.write('  config                   Re-run the setup wizard\n')
  process.stdout.write('  update                   Update GSD to the latest version\n')
  process.stdout.write('  sessions                 List and resume a past session\n')
  process.stdout.write('  headless [cmd] [args]    Run /gsd commands without TUI (default: auto)\n')
  process.stdout.write('\nRun gsd <subcommand> --help for subcommand-specific help.\n')
}

export function printSubcommandHelp(subcommand: string, version: string): boolean {
  const help = SUBCOMMAND_HELP[subcommand]
  if (!help) return false
  process.stdout.write(`GSD v${version} — Get Shit Done\n\n`)
  process.stdout.write(help + '\n')
  return true
}
