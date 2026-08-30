from __future__ import annotations
import argparse
from pathlib import Path
import re
import yaml

SKILL_ALLOWED={"name","description","required_reads","distribution_tier"}
SKILL_REFERENCE_RE=re.compile(r"`(skill-[a-z0-9]+(?:-[a-z0-9]+)*)`")
RULE_REFERENCE_RE=re.compile(r"`(docs/operating_system/rules/[A-Za-z0-9._/-]+\.md)`")

def _meta(path: Path):
    text=path.read_text(encoding="utf-8",errors="ignore")
    if not text.startswith("---"): return None
    parts=text.split("---",2)
    value=yaml.safe_load(parts[1]) if len(parts)==3 else None
    return value if isinstance(value,dict) else None

def validate(root: Path) -> list[str]:
    findings=[]
    skills=list((root/".agents/skills").glob("*/SKILL.md"))
    for path in sorted(skills):
        meta=_meta(path)
        if meta is None:
            findings.append(f"{path}: missing frontmatter"); continue
        for key in ("name","description"):
            if not isinstance(meta.get(key),str) or not meta[key].strip(): findings.append(f"{path}: invalid {key}")
        if meta.get("name") != path.parent.name: findings.append(f"{path}: name must match folder")
        extra=set(meta)-SKILL_ALLOWED
        if extra: findings.append(f"{path}: unused metadata {sorted(extra)}")
        reads=meta.get("required_reads",[])
        if not isinstance(reads,list): findings.append(f"{path}: required_reads must be list")
        elif len(reads)>1: findings.append(f"{path}: more than one unconditional required read")
        else:
            for read in reads:
                if not (root/read).exists(): findings.append(f"{path}: missing required read {read}")
    skill_names={path.parent.name for path in skills}
    reference_paths=set((root/".agents/skills").rglob("*.md"))
    reference_paths.update((root/"docs/operating_system/rules").glob("*.md"))
    reference_paths.update({
        root/"docs/operating_system/templates/agents/root-AGENTS.template.md",
        root/"docs/operating_system/planning/planning-dispatch.md",
    })
    for path in sorted(candidate for candidate in reference_paths if candidate.exists()):
        text=path.read_text(encoding="utf-8",errors="ignore")
        rel=path.relative_to(root).as_posix()
        for line_number,line in enumerate(text.splitlines(),start=1):
            for match in SKILL_REFERENCE_RE.finditer(line):
                skill_name=match.group(1)
                if line[:match.start()].rstrip().lower().endswith(" not"): continue
                if skill_name not in skill_names: findings.append(f"{rel}:{line_number}: missing skill reference {skill_name}")
            for rule_path in RULE_REFERENCE_RE.findall(line):
                if not (root/rule_path).is_file(): findings.append(f"{rel}:{line_number}: missing rule reference {rule_path}")
    return findings

def main(argv=None):
    parser=argparse.ArgumentParser(description="Validate lean skill metadata.")
    parser.add_argument("--repo-root",default=str(Path(__file__).resolve().parents[1]))
    args=parser.parse_args(argv)
    findings=validate(Path(args.repo_root))
    if findings:
        print("Agent metadata validation failed:")
        for finding in findings: print(f"- {finding}")
        return 1
    print("Agent metadata validation passed.")
    return 0

if __name__=="__main__": raise SystemExit(main())
