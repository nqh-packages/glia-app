---
name: schema-review-endpoint
description: Test the Glia Gemini prompt and schema contracts against the live Convex dev deployment. Use when validating `POST /schema/review`, generating synthetic room data, seeding statement-first responses and reactions, or comparing Gemini outputs across prompt revisions and scenario presets.
---

# Glia Prompt Lab

## Workflows

| Goal | Script | Reads from `.env.local` |
|------|--------|-------------------------|
| Review a JSON schema contract | `scripts/review_schema.py` | `VITE_CONVEX_SITE_URL` |
| Seed a full synthetic room and run live analysis | `scripts/run_prompt_lab.mjs` | `VITE_CONVEX_URL` |

## Quick Start: Schema Review

```bash
python3 .claude/skills/schema-review-endpoint/scripts/review_schema.py contracts/output.schema.json
```

## Quick Start: Prompt Lab

```bash
node .claude/skills/schema-review-endpoint/scripts/run_prompt_lab.mjs --scenario polarized --participants 8
```

## Scenario Presets

| Preset | Shape | Best for |
|--------|-------|----------|
| `polarized` | yes/no split with little middle ground | camp separation, compromise quality |
| `consensus` | strong majority with light opposition | over-clustering, support weighting |
| `nuanced` | heavy neutral context and mixed trade-offs | nuanced synthesis, spectrum balance |

## Current Schema Model

| Layer | Current model |
|-------|---------------|
| Room | one host-created main statement |
| Primary participant input | one `yes | neutral | no` response per participant |
| Optional explanation | `reason` on the participant response |
| Secondary social signal | `yes | neutral | no` reactions on responses |
| Not in current schema | threaded replies / nested comments |

## Prompt Iteration Loop

1. Update `convex/analysisAction.ts`
2. Run `npx convex dev`
3. Run `scripts/run_prompt_lab.mjs` with one or more presets
4. Compare `summary`, `camps`, `spectrum`, and `compromise`
5. Save a full JSON artifact with `--output`

## Reporting Format

| Workflow | Report |
|----------|--------|
| Schema review | schema file, endpoint URL, summary, risks, suggestions, pass/fail |
| Prompt lab | scenario, participant count, room code, seeded response mix, spectrum, camps, compromise summary, success/failure |

## Resources

| File | Purpose |
|------|---------|
| `scripts/review_schema.py` | review schema contract against `POST /schema/review` |
| `scripts/run_prompt_lab.mjs` | seed Convex, trigger analysis, print full result JSON |
| `references/endpoint-contract.md` | HTTP action request/response contract |
