# Endpoint Contract

## Path

- `POST /schema/review`

## Request

```json
{
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object"
  }
}
```

## Success response

```json
{
  "ok": true,
  "review": {
    "summary": "string",
    "risks": ["string"],
    "suggestions": ["string"]
  }
}
```

## Error responses

- `400`: missing or invalid `schema` payload
- `502`: Gemini review failed or returned malformed JSON

## Notes

- The endpoint accepts arbitrary posted schema payloads.
- The endpoint is backend-only; it does not depend on frontend state.
- The review is advisory. It does not prove a schema is correct, only that Gemini found likely risks and improvements.
- `scripts/review_schema.py` defaults to `VITE_CONVEX_SITE_URL/schema/review` when `.env.local` is present.
