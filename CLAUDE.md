# Glia — Community Decision Synthesizer

Hackathon project. 3-hour build. Single-page web app.

---

## What It Does

Users paste text or images of community discussions (WhatsApp groups, Reddit threads, building assemblies). Gemini AI analyzes sentiment, identifies opposing camps, and generates a data-driven compromise.

---

## Architecture

```
Single Page App (HTML + JS)
    |
    v
Input: text / image paste
    |
    v
Gemini API (client-side call)
    |
    v
Output: camps + spectrum + compromise
```

No backend. No database. API key in client (hackathon scope).

---

## Team

| Person | Role | Focus Area |
|--------|------|------------|
| **Francisco** | Frontend Logic | Input handling, Gemini API calls, data flow |
| **Valentina** | UI/UX + Presentation | Page layout, styling, results display, pitch |
| **Huy** | Architecture + AI | Prompt engineering, JSON contracts, integration glue |

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vanilla HTML + CSS + JS (or React if Francisco prefers) |
| AI | Gemini API (client-side) |
| Hosting | GitHub Pages or Vercel (free) |
| Images | Gemini multimodal (accepts images directly) |

---

## Directory Structure

```
/
  index.html          # Single page app
  style.css           # Styles
  src/
    main.js           # App entry, wires UI to AI
    gemini.js         # Gemini API client
    parser.js         # Input parsing (text extraction, image handling)
    renderer.js       # Renders analysis results to DOM
  contracts/
    input.schema.json # Input contract
    output.schema.json# Output contract
  assets/             # Images, icons
  CLAUDE.md           # This file
```

---

## JSON Contracts

See `contracts/` folder. Two contracts:

1. **Input** (`input.schema.json`): What gets sent to Gemini
2. **Output** (`output.schema.json`): What Gemini returns, what UI renders

---

## Gemini Prompt Strategy

System prompt instructs Gemini to:
1. Identify distinct opinion camps from the input
2. Count/estimate supporters per camp
3. Extract key reasons per camp
4. Calculate sentiment distribution
5. Generate a compromise that addresses both sides' concerns

---

## Work Boundaries

| Francisco touches | Valentina touches | Huy touches |
|-------------------|-------------------|-------------|
| `src/main.js` | `index.html` | `src/gemini.js` |
| `src/parser.js` | `style.css` | `contracts/*` |
| `src/renderer.js` (data logic) | `src/renderer.js` (HTML templates) | Gemini prompts |

Overlap on `renderer.js` — Francisco handles data transforms, Valentina handles HTML/CSS output.

---

## Commands

```bash
# Local dev — just open index.html in browser
# Or use live server:
npx live-server .

# Deploy to GitHub Pages
git push origin main  # auto-deploys if Pages enabled
```

---

## Rules

- Keep it simple. No frameworks unless Francisco wants React.
- Gemini API key goes in a `config.js` file (gitignored for real, but ok for hackathon demo).
- All three can push to main directly. No PRs needed (hackathon speed).
- Commit often with clear messages.
