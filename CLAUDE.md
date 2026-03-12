# Glia — Shared Discussion Synthesizer

Hackathon project. Fast build, but now multi-user. Shared rooms, live participation, AI synthesis.

---

## What It Does

Glia lets a host start a discussion room around a topic, invite others by short code, short link, or QR code, collect names + explicit `yes | neutral | no` responses + optional photos, gather secondary vote signals on those responses, and then generate an AI synthesis of the room.

Core outputs:
- per-response summaries with declared choice preserved
- response camps / clusters
- `yes | neutral | no` spectrum
- key themes
- compromise / suggested middle ground

---

## Product Rules

- A room starts with a host-created topic / initial statement.
- Join methods: short code, share link, QR code.
- Participants enter a display name to join.
- The room topic is the main statement everyone is responding to.
- Each participant submits one response to that main statement with a required `yes | neutral | no` choice.
- A written reason is optional and is attached to that response.
- Participants should prefer endorsing an existing reason instead of repeating the same reasoning.
- Responses may include optional image attachments.
- Reactions happen before analysis.
- Reaction options are `yes`, `neutral`, and `no`.
- Optional text reasoning appears only after a reaction is chosen.
- Neutral is not agreement or disagreement. It means "I have context / nuance / a suggestion."
- Analysis modes in v1:
  - `manual`: host clicks Analyze
  - `autoCount`: analyze when response count reaches threshold
  - `autoTimer`: analyze when timer ends
- Capacity modes in v1:
- `limited`: host sets max participants/responses
  - `unlimited`: no cap
- Browser persistence via cookie/localStorage is acceptable for hackathon scope.
- AI synthesizes camps, themes, and compromise from the main statement, participant responses, and secondary reaction signals. The app only collects structured inputs.

---

## Architecture

```text
Host creates room
  |
  v
Convex stores room + host token + short code
  |
  v
Participants join by code / link / QR
  |
  v
Convex stores participants + statement responses + reactions + attachments
  |
  v
Host/manual trigger OR auto trigger (count / timer)
  |
  v
Convex action calls Gemini
  |
  v
Structured analysis saved to Convex
  |
  v
Frontend renders live room state + results
```

This is no longer a frontend-only app. Backend state lives in Convex. Gemini runs server-side through a Convex action.

---

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vanilla HTML + CSS + JS (or React if Francisco prefers) |
| Realtime backend | Convex |
| AI | Gemini via server-side Convex action |
| File storage | Convex storage |
| Sharing | Short code + join link + QR code |
| Hosting | Vercel / static frontend + Convex deployment |

---

## Directory Structure

```text
/
  index.html              # App shell
  style.css               # Styles
  src/
    main.js               # Frontend entry / routing / room UI wiring
    parser.js             # Client-side input prep
    renderer.js           # Room + results rendering
    gemini.js             # Frontend Gemini helpers only if still needed; no API key here
  convex/
    schema.ts             # Room / participant / response / vote / analysis schema
    rooms.ts              # Create / join / close / room state
    opinions.ts           # Response submit / update
    votes.ts              # Voting logic
    analyses.ts           # Analysis triggers + Gemini action orchestration
    http.ts               # Only if public HTTP routes become necessary
  contracts/
    input.schema.json     # Structured payload sent to Gemini
    output.schema.json    # Structured Gemini response
  assets/                 # Images, icons
  CLAUDE.md               # Shared project directive
```

---

## Convex Data Model

### `rooms`
- `code`
- `hostName`
- `hostToken`
- `topic`
- `description` optional
- `status`: `collecting | analyzing | analyzed | closed`
- `capacityMode`: `limited | unlimited`
- `maxParticipants` optional
- `analysisMode`: `manual | autoCount | autoTimer`
- `analysisThreshold` optional
- `analysisDeadline` optional
- `language` optional
- `latestAnalysisId` optional
- timestamps

### `participants`
- `roomId`
- `name`
- `joinToken`
- `role`: `host | participant`
- `hasSubmitted`
- timestamps

### `opinions`
- `roomId`
- `participantId`
- `choice`: `yes | neutral | no`
- `reason` optional
- `attachmentIds`
- `yesCount`
- `neutralCount`
- `noCount`
- timestamps

### `reactions`
- `roomId`
- `opinionId`
- `participantId`
- `kind`: `yes | neutral | no`
- `reason` optional
- timestamps
- unique per participant/opinion pair
- interpretation: secondary reaction to a participant response, not the participant's own primary choice

### `analyses`
- `roomId`
- `status`: `pending | success | failed`
- `inputSnapshot`
- `output`
- `model`
- `promptVersion`
- `trigger`: `manual | autoCount | autoTimer`
- `error` optional
- timestamp

---

## Function Map

### Room lifecycle
- `createRoom({ hostName, topic, capacityMode, maxParticipants?, analysisMode, analysisThreshold?, analysisDeadline? })`
- `getRoomByCode({ code })`
- `getRoomState({ roomId })`
- `closeRoom({ roomId, hostToken })`

### Join / session persistence
- `joinRoom({ code, name })`
- `resumeParticipant({ roomId, joinToken })`
- `resumeHost({ roomId, hostToken })`

### Responses / uploads
- `generateUploadUrl()`
- `submitOpinion({ roomId, joinToken, choice, reason?, attachmentIds })`
- `updateOpinion({ roomId, joinToken, choice, reason?, attachmentIds })` if editing before analysis is allowed
- `listOpinions({ roomId })`

### Reactions
- `castReaction({ roomId, joinToken, opinionId, kind, reason? })`
- `removeReaction({ roomId, joinToken, opinionId })` optional
- `listReactionsForRoom({ roomId })`

### Analysis
- `requestAnalysis({ roomId, hostToken })`
- `scheduleAutoAnalysis({ roomId, trigger })`
- `analyzeRoom({ roomId, trigger })`
- `getLatestAnalysis({ roomId })`

---

## AI Contracts

`contracts/input.schema.json` and `contracts/output.schema.json` remain the source of truth.

Input contract must cover:
- room topic / initial statement
- participant responses with declared `yes | neutral | no`
- optional written reasons per response
- optional image attachments
- reaction totals per response
- optional reaction reasons
- room metadata needed for analysis mode / language

Output contract must cover:
- per-response summary with declared choice preserved
- camps / clusters
- spectrum
- key themes
- compromise
- support signal informed by reactions

Gemini output must be validated before saving.

---

## Gemini Rules

- Gemini API key must not live in the browser.
- Gemini runs server-side through a Convex action.
- Use current Gemini SDK/model guidance, not legacy client-side direct fetches.
- Store `model` and `promptVersion` on every analysis.
- Anonymize participants in model input when possible.
- Reactions are weighting signals, not hard truth labels.
- If analysis fails or returns invalid JSON, store error state and keep room usable.

---

## Session / Identity Rules

- Host browser stores `hostToken`.
- Participant browser stores `joinToken`.
- Tokens live in cookie/localStorage for hackathon scope.
- Token, not display name, is the real identity.
- Refresh/revisit should restore the same host/participant session when possible.

---

## Edge Cases

- Code collisions must be retried.
- Limited rooms stop new joins/submissions at cap.
- Unlimited rooms bypass cap checks.
- Timer-triggered analysis must define behavior for too-few responses.
- Host can close room manually.
- Analysis can be re-run manually after new input if room remains open.
- Auto-analysis must debounce to avoid repeated Gemini calls.
- Duplicate reactions from one participant on one response are not allowed.
- Frontend implementation of the reaction controls belongs to Francisco + Valentina. Backend work should only document and support the behavior.

---

## Team Boundaries

| Francisco touches | Valentina touches | Huy touches |
|-------------------|-------------------|-------------|
| `src/main.js` | `index.html` | `convex/schema.ts` |
| room create/join flows | `style.css` | `convex/analyses.ts` |
| opinion submit / vote wiring | room UI / QR / share presentation | `contracts/*` |
| client state sync with Convex | results layout / vote UI polish | Gemini prompts / output validation |
| `src/renderer.js` data wiring | `src/renderer.js` templates | session architecture / tokens / analysis orchestration |

Huy owns backend/session architecture, AI contracts, Gemini action orchestration, weighting semantics, and failure behavior.

---

## Commands

```bash
# Frontend dev
npm install
npm run dev

# Convex dev
npx convex dev

# Deploy frontend
npm run build

# Deploy Convex
npx convex deploy
```

Hook install directive:
- `npm install` automatically installs the tracked pre-commit hook via the repo `prepare` script.
- If hooks stop working after pulling, run `npm run setup-hooks`.
- The pre-commit hook syncs `CLAUDE.md` and `AGENTS.md`; whichever file was updated most recently wins, then `AGENTS.md` is restored as a symlink to `CLAUDE.md`.

If the frontend stays framework-light, keep the setup minimal. Do not add unnecessary infrastructure.

---

## Rules

- Keep the product flow simple: create room, join room, submit, vote, analyze, review results.
- Prioritize shareability and clarity over feature depth.
- No browser-exposed Gemini key.
- Prefer one structured source of truth for AI I/O in `contracts/*`.
- Default modes unless product says otherwise:
  - analysis mode = `manual`
  - capacity mode = `unlimited`
  - voting enabled before analysis
- Optimize for hackathon speed, but do not leave core trust or ownership rules ambiguous.
