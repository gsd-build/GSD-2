#!/usr/bin/env python3
"""Transform GSD components: add useTranslations + replace hardcoded strings.
Handles JSX text nodes with surrounding whitespace correctly.

Run: cd web && python3 scripts/i18n-transform.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent

def add_i18n(content, namespace, replacements, need_common=False):
    """Add useTranslations import and hook to a file's content."""
    has_i18n = 'useTranslations' in content
    
    # Check which replacements actually match
    matched = []
    for from_str, to_expr in replacements:
        # Try exact string match in JSX text context (with whitespace)
        # Pattern: >[whitespace]from_str[whitespace]<
        pattern = r'>(\s*)' + re.escape(from_str) + r'(\s*)<'
        if re.search(pattern, content):
            matched.append((from_str, to_expr, 'jsx'))
            continue
        
        # Try quoted string match
        patterns = [
            r'"' + re.escape(from_str) + r'"',
            r"'" + re.escape(from_str) + r"'",
        ]
        for pat in patterns:
            if re.search(pat, content):
                matched.append((from_str, to_expr, 'quoted'))
                break
    
    if not matched:
        return content, 0
    
    # Apply replacements
    for from_str, to_expr, kind in matched:
        if kind == 'jsx':
            wrap = f'{{{to_expr}}}'
            pattern = r'>([ \t]*)' + re.escape(from_str) + r'([ \t]*)<'
            content = re.sub(pattern, f'>{wrap}<', content)
        elif kind == 'quoted':
            wrap = f'{{{to_expr}}}' if to_expr.startswith(('t(', 'tc(')) else f'"{to_expr}"'
            pattern = r'"' + re.escape(from_str) + r'"'
            content = re.sub(pattern, wrap, content)
    
    changed = len(matched)
    if changed == 0:
        return content, 0
    
    # Add import
    if not has_i18n:
        if '"use client"' in content:
            content = content.replace(
                '"use client"',
                '"use client"\n\nimport { useTranslations } from "next-intl"'
            )
        elif 'from "react"' in content:
            content = content.replace(
                'from "react"',
                'from "react"\nimport { useTranslations } from "next-intl"'
            )
    
    # Add hook after first export function
    if f'useTranslations("{namespace}")' not in content:
        # Find export function ... { pattern
        func_match = re.search(r'(export function \w+\([^)]*\)(?::\s*[^{]*)?\{)', content)
        if func_match:
            insert_pos = func_match.end()
            after = content[insert_pos:]
            nl = after.find('\n')
            if nl >= 0:
                hook = f'\n  const t = useTranslations("{namespace}")'
                if need_common and 'useTranslations("common")' not in content:
                    hook += '\n  const tc = useTranslations("common")'
                content = content[:insert_pos + nl + 1] + hook + content[insert_pos + nl + 1:]
    
    return content, changed


def main():
    base = ROOT
    total = 0
    
    components = [
        {
            "file": "components/gsd/onboarding/step-dev-root.tsx",
            "namespace": "onboarding.root",
            "need_common": True,
            "replacements": [
                ("Dev root", "t('heading')"),
                ("The folder that contains your projects. GSD discovers and manages workspaces inside it.", "t('subheading')"),
                ("Browse", "t('browse')"),
                ("Select this folder", "t('selectThisFolder')"),
                ("No subdirectories", "t('noSubdirectories')"),
                ("Cancel", "t('cancel')"),
                ("Back", "tc('back')"),
                ("Continue", "tc('continue')"),
            ]
        },
        {
            "file": "components/gsd/onboarding/step-optional.tsx",
            "namespace": "onboarding.integrations",
            "need_common": True,
            "replacements": [
                ("Integrations", "t('heading')"),
                ("Optional tools. Nothing here blocks the workspace — configure later from settings.", "t('subheading')"),
                ("Not configured — add later from settings.", "t('notConfigured')"),
                ("Back", "tc('back')"),
                ("Continue", "tc('continue')"),
            ]
        },
        {
            "file": "components/gsd/loading-skeletons.tsx",
            "namespace": "loadingSkeletons",
            "replacements": [
                ("Current Unit", "t('currentUnit')"),
                ("Current Slice", "t('currentSlice')"),
                ("Session", "t('session')"),
                ("Recovery Summary", "t('recoverySummary')"),
                ("Recent Activity", "t('recentActivity')"),
                ("Active scope", "t('activeScope')"),
                ("Milestones", "t('milestones')"),
            ]
        },
        {
            "file": "components/gsd/focused-panel.tsx",
            "namespace": "focusedPanel",
            "need_common": False,
            "replacements": [
                ("Submit", "t('submit')"),
                ("Confirm", "t('confirm')"),
                ("Cancel", "t('cancel')"),
                ("Dismiss", "t('dismiss')"),
            ]
        },
        {
            "file": "components/gsd/terminal.tsx",
            "namespace": "terminal",
            "need_common": False,
            "replacements": [
                ("Abort", "t('abort')"),
                ("Agent is thinking…", "t('agentThinking')"),
                ("Steer", "t('steer')"),
            ]
        },
    ]
    
    for comp in components:
        filepath = base / comp["file"]
        if not filepath.exists():
            print(f"SKIP {comp['file']} - not found")
            continue
        
        content = filepath.read_text()
        result, count = add_i18n(
            content,
            comp["namespace"],
            comp["replacements"],
            comp.get("need_common", False)
        )
        
        if count > 0 and result != content:
            filepath.write_text(result)
            print(f"OK   {comp['file']} - {count} replacements")
            total += count
        else:
            print(f"SKIP {comp['file']} - no matches")
    
    print(f"\nTotal: {total} replacements")


if __name__ == "__main__":
    main()
