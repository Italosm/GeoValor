---
name: project-harness
description: Use for extending or running the repository harness and validation checks.
---

# Project Harness

Use this skill when you need to add a new repo check, verify the agent registry, or define a repeatable validation workflow.

## Default workflow
1. Start from `src/common/infrastructure/harness/project-harness.ts`.
2. Keep checks small, fast, and deterministic.
3. Surface structural issues before heavier commands like lint or typecheck.
4. Update the manifest when agents, subagents, or skills change.

## Guardrails
- Prefer read-only checks.
- Avoid network calls.
- Keep output terse and actionable.
