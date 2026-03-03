#!/usr/bin/env python3
"""
Validate commit messages contain Azure DevOps work item reference.

Accepted format: Any commit message that includes AB#<number>
Examples:
- feat(AB#1234): add new feature
- fix(AB#12345): resolve bug
- AB#123: update documentation
- Update config (AB#456)
"""

import argparse
import re
import sys

# Pattern: AB#<digits>
WORK_ITEM_PATTERN = re.compile(r"AB#\d+")

# Allow merge commits
MERGE_PATTERN = re.compile(r"^Merge\s+(branch|pull request|remote-tracking branch)")


def validate_commit_message(commit_msg: str) -> tuple[bool, str | None]:
    """
    Validate that commit message contains an Azure DevOps work item reference.

    Returns:
        tuple: (is_valid: bool, error_message: str or None)
    """
    lines = commit_msg.strip().split("\n")
    if not lines:
        return False, "Commit message is empty"

    first_line = lines[0].strip()

    # Allow merge commits
    if MERGE_PATTERN.match(first_line):
        return True, None

    # Check if commit message contains AB#<number>
    if WORK_ITEM_PATTERN.search(commit_msg):
        return True, None

    return False, (
        f"Invalid commit message: '{first_line}'\n\n"
        f"Commit message must contain an Azure DevOps work item reference:\n"
        f"  Format: AB#<number>\n\n"
        f"Examples:\n"
        f"  feat(AB#1234): add user authentication\n"
        f"  fix(AB#5678): resolve memory leak\n"
        f"  AB#9012: update API documentation\n"
        f"  Update config (AB#456)\n\n"
        f"The work item reference can appear anywhere in your commit message."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate commit message format")
    parser.add_argument(
        "--commit-msg-file", default=".git/COMMIT_EDITMSG", help="Path to commit message file"
    )
    args = parser.parse_args()

    try:
        with open(args.commit_msg_file, encoding="utf-8") as f:
            commit_msg = f.read()
    except FileNotFoundError:
        print(f"Error: Commit message file not found: {args.commit_msg_file}")
        sys.exit(1)

    is_valid, error_message = validate_commit_message(commit_msg)

    if not is_valid:
        print("\n" + "=" * 70)
        print("[ERROR] COMMIT MESSAGE VALIDATION FAILED")
        print("=" * 70)
        print(error_message)
        print("=" * 70 + "\n")
        sys.exit(1)

    print("[OK] Commit message is valid")
    sys.exit(0)


if __name__ == "__main__":
    main()
