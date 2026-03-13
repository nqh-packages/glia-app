import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { renderResults } from './renderer.js';

const SESSION_KEY = 'glia.session.v1';
const RESPONSE_BUTTON_IDS = [
  'btn-opinion-thumb-up',
  'btn-opinion-chat',
  'btn-opinion-thumb-down',
];
const PRIMARY_CHOICE_BY_BUTTON = {
  'btn-opinion-thumb-up': 'yes',
  'btn-opinion-chat': 'neutral',
  'btn-opinion-thumb-down': 'no',
};
const REACTION_BUTTONS = [
  { kind: 'yes', label: '👍 Yes' },
  { kind: 'neutral', label: '💬 Neutral' },
  { kind: 'no', label: '👎 No' },
];

const app = document.getElementById('app');
const loadingEl = document.getElementById('loading');

// #region agent log
fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:init',message:'module init',data:{appExists:!!app,loadingExists:!!loadingEl,href:window.location.href},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
// #endregion

const state = {
  roomId: null,
  roomCode: null,
  hostToken: null,
  joinToken: null,
  isHost: false,
  topic: '',
  participantName: '',
  participantId: null,
  viewerHasSubmitted: false,
  opinions: [],
  reactionsByOpinionId: {},
  selectedOpinionIcon: null,
  latestAnalysis: null,
};

let convexClient = null;

function setView(viewId) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:setView',message:'setView called',data:{viewId,appExists:!!app},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  app.dataset.view = viewId;
}

function showError(elementId, message) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.hidden = false;
}

function clearError(elementId) {
  const el = document.getElementById(elementId);
  el.textContent = '';
  el.hidden = true;
}

async function getAppConfig() {
  const localConfig = await import('../config.js')
    .then((module) => module.APP_CONFIG ?? null)
    .catch(() => null);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:getAppConfig',message:'config resolved',data:{hasLocalConfig:!!localConfig,localConfigUrlLength:localConfig?.convexUrl?.length ?? 0,hasGlobalConfig:!!globalThis.APP_CONFIG,globalConfigUrlLength:globalThis.APP_CONFIG?.convexUrl?.length ?? 0,hasEnvUrl:!!import.meta.env.VITE_CONVEX_URL,envUrlLength:import.meta.env.VITE_CONVEX_URL?.length ?? 0},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  return localConfig ?? globalThis.APP_CONFIG ?? {
    convexUrl: import.meta.env.VITE_CONVEX_URL,
  };
}

async function getConvexClient() {
  if (convexClient) {
    return convexClient;
  }

  const config = await getAppConfig();
  const convexUrl = config?.convexUrl?.trim();

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:getConvexClient',message:'convex url check',data:{hasConfig:!!config,hasConvexUrl:!!convexUrl,urlLength:convexUrl?.length ?? 0,isPlaceholder:!!convexUrl?.includes('your-convex-deployment')},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  if (!convexUrl || convexUrl.includes('your-convex-deployment')) {
    throw new Error('Missing Convex URL. Add `config.js` or set `VITE_CONVEX_URL`.');
  }

  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

async function convexQuery(ref, args) {
  const client = await getConvexClient();
  return client.query(ref, args);
}

async function convexMutation(ref, args) {
  const client = await getConvexClient();
  return client.mutation(ref, args);
}

function persistSession() {
  if (!state.roomId || !state.joinToken) {
    return;
  }

  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      roomId: state.roomId,
      roomCode: state.roomCode,
      hostToken: state.hostToken,
      joinToken: state.joinToken,
    })
  );
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function hydrateSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    clearSession();
    return null;
  }
}

function getSelectedChoice() {
  return PRIMARY_CHOICE_BY_BUTTON[state.selectedOpinionIcon] ?? null;
}

function getMyOpinion() {
  return state.opinions.find((opinion) => opinion.participantId === state.participantId) ?? null;
}

function resetOpinionComposer() {
  state.selectedOpinionIcon = null;
  RESPONSE_BUTTON_IDS.forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.getElementById('room-opinion-input').hidden = true;
  document.getElementById('opinion-text').value = '';
  document.getElementById('opinion-image').value = '';
  document.getElementById('opinion-status').textContent = '';
  clearError('opinion-error');
}

function showOpinionInput(iconButtonId) {
  state.selectedOpinionIcon = iconButtonId;

  RESPONSE_BUTTON_IDS.forEach((id) => {
    document.getElementById(id)?.classList.toggle('active', id === iconButtonId);
  });

  const existingOpinion = getMyOpinion();
  document.getElementById('room-opinion-input').hidden = false;
  document.getElementById('opinion-text').value = existingOpinion?.reason ?? '';
  document.getElementById('opinion-text').focus();
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function renderOpinionsList() {
  const list = document.getElementById('opinions-list');
  const empty = document.getElementById('opinions-empty');

  list.innerHTML = '';

  state.opinions.forEach((opinion) => {
    const myReaction = state.reactionsByOpinionId[opinion._id];
    const isOwnOpinion = opinion.participantId === state.participantId;
    const card = document.createElement('div');

    card.className = 'opinion-card';
    card.dataset.choice = opinion.choice;
    card.innerHTML = `
      <div class="opinion-topline">
        <span class="choice-pill choice-pill--${escapeHtml(opinion.choice)}">${escapeHtml(opinion.choice)}</span>
        <p class="opinion-meta">${escapeHtml(opinion.participantName)}</p>
      </div>
      <p class="opinion-text">${escapeHtml(opinion.reason || 'No written reason provided.')}</p>
      <div class="opinion-votes">
        ${REACTION_BUTTONS.map(({ kind, label }) => `
          <button
            type="button"
            class="vote-btn vote-btn--${kind} ${myReaction === kind ? 'active' : ''}"
            data-opinion-id="${opinion._id}"
            data-kind="${kind}"
            ${isOwnOpinion ? 'disabled' : ''}
          >${label}</button>
        `).join('')}
      </div>
      <p class="vote-count">${opinion.yesCount} yes · ${opinion.neutralCount} neutral · ${opinion.noCount} no</p>
    `;

    list.appendChild(card);
  });

  empty.hidden = state.opinions.length > 0;
}

function updateRoomUI() {
  document.getElementById('room-topic-title').textContent = state.topic;
  document.getElementById('room-code-badge').textContent = state.roomCode ?? '—';
  document.getElementById('room-code-inroom').textContent = state.roomCode ?? '—';
  document.getElementById('room-role').textContent = state.isHost ? '(Host)' : '(Participant)';
  document.getElementById('host-actions').hidden = !state.isHost;
  document.getElementById('btn-submit-opinion').textContent = state.viewerHasSubmitted
    ? 'Update response'
    : 'Submit response';
  renderOpinionsList();
}

async function refreshRoomState({ showResultsWhenReady = false } = {}) {
  if (!state.roomId) {
    return;
  }

  const snapshot = await convexQuery(api.rooms.getRoomState, {
    roomId: state.roomId,
    joinToken: state.joinToken ?? undefined,
    hostToken: state.hostToken ?? undefined,
  });

  if (!snapshot) {
    clearSession();
    throw new Error('Room not found.');
  }

  state.roomCode = snapshot.room.code;
  state.topic = snapshot.room.topic;
  state.isHost = snapshot.viewer.isHost;
  state.participantId = snapshot.viewer.participantId;
  state.participantName = snapshot.viewer.name ?? state.participantName;
  state.viewerHasSubmitted = snapshot.viewer.hasSubmitted;
  state.opinions = snapshot.opinions;
  state.latestAnalysis = snapshot.latestAnalysis ?? null;
  state.reactionsByOpinionId = {};

  snapshot.reactions.forEach((reaction) => {
    if (reaction.participantId === state.participantId) {
      state.reactionsByOpinionId[reaction.opinionId] = reaction.kind;
    }
  });

  persistSession();
  updateRoomUI();

  if (
    showResultsWhenReady &&
    state.latestAnalysis?.status === 'success' &&
    state.latestAnalysis.output
  ) {
    renderResults(state.latestAnalysis.output);
    loadingEl.hidden = true;
    setView('results');
    return true;
  }

  return false;
}

async function waitForAnalysisResult() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const didRender = await refreshRoomState({ showResultsWhenReady: true });

    if (didRender) {
      return;
    }

    if (state.latestAnalysis?.status === 'failed') {
      throw new Error(state.latestAnalysis.error || 'Analysis failed.');
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 1500);
    });
  }

  throw new Error('Analysis is still running. Please try again in a moment.');
}

async function uploadSelectedFiles(fileList) {
  const files = Array.from(fileList ?? []);
  if (!files.length) {
    return [];
  }

  const storageIds = [];

  for (const file of files) {
    const uploadUrl = await convexMutation(api.opinions.generateUploadUrl, {});
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Upload failed for ${file.name}.`);
    }

    const payload = await response.json();
    storageIds.push(payload.storageId);
  }

  return storageIds;
}

async function createRoom() {
  clearError('create-error');

  const hostName = document.getElementById('host-name').value.trim();
  const topic = document.getElementById('room-topic').value.trim();

  if (!hostName || !topic) {
    showError('create-error', 'Enter your name and a topic.');
    return;
  }

  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:createRoom',message:'create room start',data:{hasHostName:!!hostName,topicLength:topic.length},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    const result = await convexMutation(api.rooms.createRoom, {
      hostName,
      topic,
      capacityMode: 'unlimited',
      analysisMode: 'manual',
      origin: window.location.origin,
    });

    state.roomId = result.roomId;
    state.roomCode = result.code;
    state.hostToken = result.hostToken;
    state.joinToken = result.joinToken;
    state.isHost = true;
    state.topic = topic;
    state.participantName = hostName;
    state.participantId = result.participantId;
    state.viewerHasSubmitted = false;
    state.opinions = [];
    state.reactionsByOpinionId = {};

    persistSession();

    document.getElementById('display-room-code').textContent = result.code;
    document.getElementById('display-join-link').value = result.joinUrl;
    setView('room-created');
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:createRoom',message:'create room failed',data:{errorMessage:error?.message ?? 'unknown'},timestamp:Date.now(),hypothesisId:'H5'})}).catch(()=>{});
    // #endregion
    showError('create-error', error.message || 'Could not create the room.');
  }
}

async function joinRoom() {
  clearError('landing-error');

  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();

  if (!code || !name) {
    showError('landing-error', 'Enter a code and your name.');
    return;
  }

  try {
    const result = await convexMutation(api.rooms.joinRoom, { code, name });

    state.roomId = result.roomId;
    state.roomCode = code;
    state.hostToken = null;
    state.joinToken = result.joinToken;
    state.isHost = false;
    state.participantName = name;
    state.participantId = result.participantId;
    state.viewerHasSubmitted = false;

    await refreshRoomState();
    resetOpinionComposer();
    setView('room');
  } catch (error) {
    showError('landing-error', error.message || 'Could not join that room.');
  }
}

async function submitOrUpdateResponse() {
  clearError('opinion-error');

  const choice = getSelectedChoice();
  const reason = document.getElementById('opinion-text').value.trim();

  if (!choice) {
    showError('opinion-error', 'Choose yes, neutral, or no first.');
    return;
  }

  try {
    const attachmentIds = await uploadSelectedFiles(
      document.getElementById('opinion-image').files
    );

    const mutationRef = state.viewerHasSubmitted
      ? api.opinions.updateOpinion
      : api.opinions.submitOpinion;

    await convexMutation(mutationRef, {
      roomId: state.roomId,
      joinToken: state.joinToken,
      choice,
      reason: reason || undefined,
      attachmentIds,
    });

    document.getElementById('opinion-status').textContent = state.viewerHasSubmitted
      ? 'Response updated.'
      : 'Response submitted.';

    await refreshRoomState();
    resetOpinionComposer();
  } catch (error) {
    showError('opinion-error', error.message || 'Could not save your response.');
  }
}

async function handleReactionClick(event) {
  const button = event.target.closest('.vote-btn[data-opinion-id][data-kind]');
  if (!button) {
    return;
  }

  const opinionId = button.dataset.opinionId;
  const kind = button.dataset.kind;
  const previousKind = state.reactionsByOpinionId[opinionId];

  try {
    if (previousKind === kind) {
      await convexMutation(api.votes.removeReaction, {
        roomId: state.roomId,
        joinToken: state.joinToken,
        opinionId,
      });
    } else {
      await convexMutation(api.votes.castReaction, {
        roomId: state.roomId,
        joinToken: state.joinToken,
        opinionId,
        kind,
      });
    }

    await refreshRoomState();
  } catch (error) {
    showError('opinion-error', error.message || 'Could not save your reaction.');
  }
}

async function startAnalysis() {
  loadingEl.hidden = false;
  clearError('opinion-error');

  try {
    await convexMutation(api.analyses.requestAnalysis, {
      roomId: state.roomId,
      hostToken: state.hostToken,
    });

    await waitForAnalysisResult();
  } catch (error) {
    loadingEl.hidden = true;
    showError('opinion-error', error.message || 'Could not run analysis.');
  }
}

async function restoreExistingSession() {
  const session = hydrateSession();

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:restoreExistingSession',message:'restore session start',data:{hasSession:!!session,hasRoomId:!!session?.roomId,hasJoinToken:!!session?.joinToken},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
  // #endregion

  if (!session?.roomId || !session?.joinToken) {
    return;
  }

  state.roomId = session.roomId;
  state.roomCode = session.roomCode ?? null;
  state.hostToken = session.hostToken ?? null;
  state.joinToken = session.joinToken;

  try {
    await refreshRoomState();
    resetOpinionComposer();
    setView('room');
  } catch {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/main.js:restoreExistingSession',message:'restore session failed',data:{roomId:state.roomId != null,hasHostToken:!!state.hostToken},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    clearSession();
  }
}

function prefillJoinCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    document.getElementById('join-code').value = code.toUpperCase();
  }
}

document.getElementById('btn-create-room').addEventListener('click', () => {
  clearError('create-error');
  setView('create');
});

document.getElementById('btn-join-room').addEventListener('click', joinRoom);
document.getElementById('btn-back-landing').addEventListener('click', () => setView('landing'));
document.getElementById('btn-do-create-room').addEventListener('click', createRoom);
document.getElementById('btn-enter-room-as-host').addEventListener('click', async () => {
  await refreshRoomState();
  resetOpinionComposer();
  setView('room');
});

document.getElementById('btn-copy-code').addEventListener('click', async () => {
  await navigator.clipboard.writeText(document.getElementById('display-room-code').textContent);
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  await navigator.clipboard.writeText(document.getElementById('display-join-link').value);
});

document.getElementById('btn-copy-code-inroom').addEventListener('click', async () => {
  await navigator.clipboard.writeText(state.roomCode ?? '');
});

RESPONSE_BUTTON_IDS.forEach((id) => {
  document.getElementById(id).addEventListener('click', () => showOpinionInput(id));
});

document.getElementById('btn-submit-opinion').addEventListener('click', submitOrUpdateResponse);
document.getElementById('opinions-list').addEventListener('click', handleReactionClick);
document.getElementById('btn-analyze').addEventListener('click', startAnalysis);
document.getElementById('btn-back-to-room').addEventListener('click', () => setView('room'));

prefillJoinCodeFromUrl();
setView('landing');
restoreExistingSession();
