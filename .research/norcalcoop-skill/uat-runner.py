#!/usr/bin/env python3
"""agent-browser batch test runner.  Usage: python3 uat-runner.py <spec.yaml|spec.json>"""
import json, subprocess, sys, os, re, datetime, pathlib

try:
    import yaml
    def _load(p): return yaml.safe_load(pathlib.Path(p).read_text())
except ImportError:
    def _load(p):
        if str(p).endswith(('.yaml', '.yml')): sys.exit("pip install pyyaml  # needed for YAML specs")
        return json.loads(pathlib.Path(p).read_text())

def ab(cmd, timeout=30):
    r = subprocess.run(f"agent-browser {cmd}", shell=True, capture_output=True, text=True, timeout=timeout)
    return r.returncode == 0, r.stdout.strip(), r.stderr.strip()

def eval_js(js):
    ok, out, err = ab(f"eval {json.dumps(js)} --json")
    if not ok: return None, err or out
    try:
        d = json.loads(out); v = d.get('data', {})
        return str(v.get('result', v) if isinstance(v, dict) else v), None
    except Exception as e: return None, f"parse error: {e} | {out[:200]}"

def check(a):
    t, exp = a['type'], str(a.get('expected', ''))
    if t in ('eval_contains', 'eval_not_contains', 'eval_equals'):
        val, err = eval_js(a['js'])
        if val is None: return False, f"eval failed: {err}"
        if t == 'eval_contains':     return exp in val,  f"{'✓' if exp in val else '✗'} {exp!r} in {val!r}"
        if t == 'eval_not_contains': return exp not in val, f"{'✓' if exp not in val else '✗'} absent {exp!r} from {val!r}"
        if t == 'eval_equals':       return val == exp,  f"got {val!r}, want {exp!r}"
    elif t == 'url_contains':
        val, err = eval_js("window.location.href")
        if val is None: return False, f"url check failed: {err}"
        return exp in val, f"url={val!r}"
    elif t == 'text_present':
        ok, _, _ = ab(f"wait --text {json.dumps(exp)} --timeout 5000")
        return ok, f"text {exp!r} {'found' if ok else 'not found'}"
    elif t == 'snapshot_contains':
        ok, out, _ = ab("snapshot --json")
        return exp.lower() in out.lower(), f"{'found' if exp.lower() in out.lower() else 'missing'} {exp!r} in snapshot"
    return False, f"unknown type: {t!r}"

def run_test(test, app, fd):
    name = test['name']
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    if js := test.get('setup_js'): ab(f"eval {json.dumps(js)}")
    for step in test.get('steps', []):
        ok, out, err = ab(step.replace('{app}', app))
        if not ok:
            ss = f"{fd}/{slug}.png"; ab(f"screenshot {ss}"); _, con, _ = ab("errors --json"); ab("close")
            return False, {'name': name, 'failed_at': f"step: {step}", 'actual': err or out, 'screenshot': ss, 'console': con}
    for a in test.get('assertions', []):
        ok, msg = check(a)
        if not ok:
            ss = f"{fd}/{slug}.png"; ab(f"screenshot {ss}"); _, con, _ = ab("errors --json"); ab("close")
            return False, {'name': name, 'failed_at': f"assertion:{a['type']}", 'expected': str(a.get('expected', '')), 'actual': msg, 'screenshot': ss, 'console': con}
    return True, None

def main():
    if len(sys.argv) < 2: sys.exit("Usage: python3 uat-runner.py <spec.yaml|spec.json>")
    spec = _load(sys.argv[1])
    spec_path = pathlib.Path(sys.argv[1])
    phase, app = spec.get('phase', 'unknown'), spec['app'].rstrip('/')
    tests = spec['tests']
    fd = spec.get('failures_dir', str(spec_path.parent / 'uat-failures'))
    os.makedirs(fd, exist_ok=True)
    print(f"Running {len(tests)} tests against {app}\n")
    passed, failed = [], []
    for t in tests:
        print(f"  {t['name']} ...", end=' ', flush=True)
        ok, info = run_test(t, app, fd)
        (passed if ok else failed).append(t['name'] if ok else info); print("✅" if ok else "❌")
    ab("close")
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    rpt = [f"# UAT Browser Results — Phase {phase}", "", f"Run: {now}", f"Spec: {sys.argv[1]}",
           f"App: {app}", "", "---", "", "## Summary", "",
           f"✅ Passed: {len(passed)}/{len(tests)}", f"❌ Failed: {len(failed)}/{len(tests)}",
           "", "---", "", "## Passed Tests", ""] + [f"- ✅ {n}" for n in passed]
    if failed:
        rpt += ["", "---", "", "## Failed Tests", ""]
        for f in failed:
            rpt += [f"### ❌ {f['name']}", "", f"**Failed at:** {f.get('failed_at','?')}",
                    f"**Expected:** {f.get('expected','')}", f"**Actual:** {f.get('actual','')}",
                    f"**Screenshot:** `{f.get('screenshot','')}`", "**Console errors:**",
                    "```", f.get('console', 'none'), "```", ""]
    stem = spec_path.stem
    out_name = stem.replace('-TESTS', '-BROWSER') + '.md' if '-TESTS' in stem else stem + '-BROWSER.md'
    out = str(spec_path.parent / out_name)
    pathlib.Path(out).write_text("\n".join(rpt) + "\n")
    print(f"\nReport: {out} | {len(passed)}/{len(tests)} passed")
    sys.exit(0 if not failed else 1)

if __name__ == "__main__": main()
