from pathlib import Path
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('agent_schema',ROOT/'scripts/validate_agent_metadata_schema.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

def test_agent_metadata_matches_lean_schema():
    assert module.validate(ROOT)==[]


def test_agent_metadata_allows_no_workflow_directory(tmp_path):
    skills = tmp_path / ".agents" / "skills" / "sample"
    skills.mkdir(parents=True)
    (skills / "SKILL.md").write_text(
        "---\nname: sample\ndescription: Sample skill.\nrequired_reads: []\n---\n",
        encoding="utf-8",
    )
    assert module.validate(tmp_path) == []

def write_skill(root: Path, name: str, body: str = "") -> None:
    skill = root / ".agents" / "skills" / name
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: Sample skill.\nrequired_reads: []\n---\n{body}\n",
        encoding="utf-8",
    )

def test_agent_references_accept_existing_skill_and_rule(tmp_path):
    write_skill(tmp_path,"skill-sample","Use `skill-helper` and `docs/operating_system/rules/sample-rule.md`.")
    write_skill(tmp_path,"skill-helper")
    rule=tmp_path/"docs"/"operating_system"/"rules"/"sample-rule.md"
    rule.parent.mkdir(parents=True)
    rule.write_text("# Sample Rule\n",encoding="utf-8")
    assert module.validate(tmp_path)==[]

def test_agent_references_reject_missing_skill(tmp_path):
    write_skill(tmp_path,"skill-sample","Use `skill-missing`.")
    assert module.validate(tmp_path)==[".agents/skills/skill-sample/SKILL.md:6: missing skill reference skill-missing"]

def test_agent_references_reject_missing_rule(tmp_path):
    write_skill(tmp_path,"skill-sample","Follow `docs/operating_system/rules/missing-rule.md`.")
    assert module.validate(tmp_path)==[".agents/skills/skill-sample/SKILL.md:6: missing rule reference docs/operating_system/rules/missing-rule.md"]
