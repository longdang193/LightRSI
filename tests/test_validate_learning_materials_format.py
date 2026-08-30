"""Tests for scripts/validate_learning_materials_format.py."""

from __future__ import annotations

from pathlib import Path

from scripts.validate_learning_materials_format import validate_card_blocks


def test_validate_card_blocks_accepts_template_spacing() -> None:
    text = """SSTART

T-F_Obsidian-v2

Q: [Question]

A: [Answer]

E: [Explanation]

EEND
"""
    issues = validate_card_blocks(path=Path("card.md"), text=text)
    assert issues == []


def test_validate_card_blocks_requires_blank_line_below_sstart() -> None:
    text = """SSTART
T-F_Obsidian-v2

Q: [Question]

A: [Answer]

E: [Explanation]

EEND
"""
    issues = validate_card_blocks(path=Path("card.md"), text=text)
    assert any("below SSTART" in issue.message for issue in issues)


def test_validate_card_blocks_requires_blank_line_above_eend() -> None:
    text = """SSTART

T-F_Obsidian-v2

Q: [Question]

A: [Answer]

E: [Explanation]
EEND
"""
    issues = validate_card_blocks(path=Path("card.md"), text=text)
    assert any("above EEND" in issue.message for issue in issues)


def test_validate_card_blocks_requires_blank_line_above_a_and_e() -> None:
    text = """SSTART

T-F_Obsidian-v2

Q: [Question]
A: [Answer]
E: [Explanation]

EEND
"""
    issues = validate_card_blocks(path=Path("card.md"), text=text)
    assert any("above A:" in issue.message for issue in issues)
    assert any("above E:" in issue.message for issue in issues)
