---
name: schema-review-endpoint
description: Review arbitrary JSON Schema payloads against the Glia schema review endpoint and summarize Gemini feedback. Use when validating a schema before sending it to Gemini, smoke-testing `POST /schema/review`, checking structured-output contract quality, or comparing risks and suggestions across schema revisions.
---

# Schema Review Endpoint

## Overview

Send a JSON schema file to the local Glia review endpoint and summarize the returned risks and suggestions. Use this before changing schema contracts or when debugging structured-output reliability.

## Workflow

1. Confirm the local schema review endpoint is running.
2. Identify the JSON schema file to test.
3. Send the schema to `POST /schema/review`.
4. Report the response summary, risks, suggestions, and any endpoint failure details.

## Quick Start

```bash
python3 .claude/skills/schema-review-endpoint/scripts/review_schema.py contracts/output.schema.json
```

Use `--endpoint` if the local endpoint URL differs.

## Reporting Format

Return:
- schema file tested
- endpoint URL used
- summary
- risks
- suggestions
- pass/fail status of the endpoint call

If the endpoint fails, include the raw error body.

## Resources

- Script: `scripts/review_schema.py`
- Endpoint contract: `references/endpoint-contract.md`
