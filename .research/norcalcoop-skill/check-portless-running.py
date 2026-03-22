#!/usr/bin/env python3
"""
Check whether a named portless service is currently running.

Usage: python3 check-portless-running.py <portless-name>

Run from any directory — checks the portless state file in ~/.portless/routes.json.

Outputs one of:
  RUNNING: <name> -> port <port> -> http://<name>.localhost:1355
  NOT_RUNNING: <name> not found in active routes
  NOT_RUNNING: portless state file not found — proxy may not be started
"""
import json
import os
import sys

if len(sys.argv) < 2:
    print('Usage: check-portless-running.py <portless-name>', file=sys.stderr)
    sys.exit(1)

name = sys.argv[1]

state_file = os.environ.get('PORTLESS_STATE_DIR', os.path.expanduser('~/.portless')) + '/routes.json'
if not os.path.exists(state_file):
    state_file = '/tmp/portless/routes.json'

try:
    routes = json.loads(open(state_file).read())
    match = next(
        (r for r in routes if r.get('hostname') == f'{name}.localhost' or r.get('name') == name),
        None,
    )
    if match:
        print(f'RUNNING: {name} -> port {match["port"]} -> http://{name}.localhost:1355')
    else:
        print(f'NOT_RUNNING: {name} not found in active routes')
except FileNotFoundError:
    print('NOT_RUNNING: portless state file not found — proxy may not be started')
