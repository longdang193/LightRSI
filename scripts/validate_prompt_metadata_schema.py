from __future__ import annotations
import argparse
from pathlib import Path
import yaml

REQUIRED = {"name", "description"}
ALLOWED = REQUIRED | {"distribution_tier"}

def validate(root: Path) -> list[str]:
    findings=[]
    for path in sorted((root/"docs/operating_system/prompt_templates").glob("*-prompt.md")):
        text=path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            findings.append(f"{path}: missing frontmatter")
            continue
        parts=text.split("---",2)
        meta=yaml.safe_load(parts[1]) if len(parts)==3 else None
        if not isinstance(meta,dict):
            findings.append(f"{path}: invalid frontmatter")
            continue
        missing=REQUIRED-set(meta)
        extra=set(meta)-ALLOWED
        if missing: findings.append(f"{path}: missing {sorted(missing)}")
        if extra: findings.append(f"{path}: unused metadata {sorted(extra)}")
        if meta.get("name") != path.stem: findings.append(f"{path}: name must match filename")
    return findings

def main(argv=None):
    parser=argparse.ArgumentParser(description="Validate lean prompt metadata.")
    parser.add_argument("--repo-root",default=str(Path(__file__).resolve().parents[1]))
    args=parser.parse_args(argv)
    findings=validate(Path(args.repo_root))
    if findings:
        print("Prompt metadata validation failed:")
        for finding in findings: print(f"- {finding}")
        return 1
    print("Prompt metadata validation passed.")
    return 0

if __name__=="__main__": raise SystemExit(main())
