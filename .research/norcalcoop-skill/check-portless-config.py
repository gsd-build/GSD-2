#!/usr/bin/env python3
"""
Check whether a portless name is configured in package.json scripts.

Run from the project root directory.

Outputs one of:
  FOUND script=<script-name> name=<portless-name>
  NOT_FOUND suggested=<slug> script=<script-name> cmd=<current-command>
"""
import json
import re
import sys

try:
    data = json.load(open('package.json'))
except FileNotFoundError:
    print('ERROR: package.json not found in current directory', file=sys.stderr)
    sys.exit(1)

scripts = data.get('scripts', {})
found = []
for script_name, cmd in scripts.items():
    m = re.search(r'portless\s+(\S+)', cmd)
    if m:
        found.append((script_name, m.group(1)))

if found:
    for script_name, portless_name in found:
        print(f'FOUND script={script_name} name={portless_name}')
else:
    slug = re.sub(r'[^a-z0-9-]', '-', data.get('name', 'myapp').lower()).strip('-')
    candidate = None
    for s, c in scripts.items():
        if 'vite' in c.lower() and 'dev' in s.lower():
            candidate = s
            break
    if not candidate:
        for preferred in ['dev:client', 'dev', 'start']:
            if preferred in scripts:
                candidate = preferred
                break
    if not candidate and scripts:
        candidate = next(iter(scripts))
    candidate = candidate or 'dev'
    current_cmd = scripts.get(candidate, 'your-current-command')
    print(f'NOT_FOUND suggested={slug} script={candidate} cmd={current_cmd}')
