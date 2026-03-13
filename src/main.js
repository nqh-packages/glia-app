import { ConvexClient } from 'convex/browser';
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
  { kind: 'yes', label: 'Yes' },
  { kind: 'neutral', label: 'Neutral' },
  { kind: 'no', label: 'No' },
];

const app = document.getElementById('app');
const loadingEl = document.getElementById('loading');

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
let roomSubscription = null;
let roomSubscriptionKey = null;

function logAgentEvent() {}

function setView(viewId) {
  logAgentEvent('setView', { viewId });
  app.dataset.view = viewId;
}

function setStatus(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) {
    return;
  }
  el.textContent = message;
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

function setInputInvalid(elementId, isInvalid) {
  document.getElementById(elementId)?.classList.toggle('input-invalid', isInvalid);
}

function clearInputInvalid(...elementIds) {
  elementIds.forEach((elementId) => setInputInvalid(elementId, false));
}

function setButtonBusy(buttonId, isBusy, busyLabel, idleLabel) {
  const button = document.getElementById(buttonId);
  if (!button) {
    return;
  }
  button.disabled = isBusy;
  if (busyLabel && idleLabel) {
    button.textContent = isBusy ? busyLabel : idleLabel;
  }
}

async function getAppConfig() {
  const localConfig = await import(/* @vite-ignore */ '../config.js')
    .then((module) => module.APP_CONFIG ?? null)
    .catch(() => null);

  logAgentEvent('getAppConfig', { hasLocalConfig: !!localConfig });

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

  logAgentEvent('getConvexClient', { hasConvexUrl: !!convexUrl });

  if (!convexUrl || convexUrl.includes('your-convex-deployment')) {
    throw new Error('Missing Convex URL. Add `config.js` or set `VITE_CONVEX_URL`.');
  }

  convexClient = new ConvexClient(convexUrl);
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

async function convexAction(ref, args) {
  const client = await getConvexClient();
  return client.action(ref, args);
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

async function copyText(value, { statusId, buttonId, successMessage = 'Copied.' } = {}) {
  const text = value ?? '';
  try {
    await navigator.clipboard.writeText(text);
    if (statusId) {
      setStatus(statusId, successMessage);
    }
  } catch {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    const didCopy = document.execCommand('copy');
    document.body.removeChild(temp);
    if (statusId) {
      setStatus(
        statusId,
        didCopy ? successMessage : 'Copy failed. You can still select and copy the text manually.'
      );
    }
  }

  if (buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      const originalLabel = button.dataset.originalLabel ?? button.textContent;
      button.dataset.originalLabel = originalLabel;
      button.textContent = 'Copied';
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1400);
    }
  }
}

async function loadRoomShareAssets(code, joinUrl) {
  const qrImage = document.getElementById('display-qr-image');
  const qrLoading = document.getElementById('qr-loading');
  const downloadLink = document.getElementById('btn-download-qr');

  clearError('share-error');
  setStatus('share-status', 'Generating share assets...');
  qrImage.hidden = true;
  qrLoading.hidden = false;
  downloadLink.hidden = true;
  document.getElementById('display-join-link').value = joinUrl;

  try {
    const payload = await convexAction(api.shareAction.generateJoinQrCode, {
      code,
      origin: window.location.origin,
    });

    document.getElementById('display-join-link').value = payload.joinUrl;
    qrImage.src = payload.dataUrl;
    qrImage.hidden = false;
    qrLoading.hidden = true;
    downloadLink.href = payload.dataUrl;
    downloadLink.hidden = false;
    setStatus('share-status', 'Share the code, link, or QR code.');
  } catch (error) {
    qrLoading.hidden = false;
    qrLoading.textContent = 'QR unavailable';
    showError('share-error', error.message || 'Could not generate the QR code.');
    setStatus('share-status', '');
  }
}

function getRoomStateArgs() {
  if (!state.roomId) {
    return null;
  }

  return {
    roomId: state.roomId,
    joinToken: state.joinToken ?? undefined,
    hostToken: state.hostToken ?? undefined,
  };
}

function syncAnalysisState() {
  if (state.latestAnalysis?.status === 'pending') {
    loadingEl.hidden = false;
    setStatus(
      'opinion-status',
      state.isHost ? 'Analysis running...' : 'Analysis in progress...'
    );
    return;
  }

  loadingEl.hidden = true;

  if (state.latestAnalysis?.status === 'failed') {
    showError('opinion-error', state.latestAnalysis.error || 'Analysis failed.');
    return;
  }

  if (state.latestAnalysis?.status === 'success' && state.latestAnalysis.output) {
    clearError('opinion-error');
    setStatus('opinion-status', '');
    renderResults(state.latestAnalysis.output);
    if (app.dataset.view === 'room' || app.dataset.view === 'results') {
      setView('results');
    }
    return;
  }

  clearError('opinion-error');
}

function applyRoomSnapshot(snapshot) {
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
  syncAnalysisState();
}

function stopRoomSubscription() {
  if (roomSubscription) {
    roomSubscription();
    roomSubscription = null;
  }
  roomSubscriptionKey = null;
}

async function ensureRoomSubscription() {
  const args = getRoomStateArgs();
  if (!args) {
    stopRoomSubscription();
    return;
  }

  const subscriptionKey = JSON.stringify(args);
  if (roomSubscription && roomSubscriptionKey === subscriptionKey) {
    return;
  }

  stopRoomSubscription();
  const client = await getConvexClient();
  roomSubscriptionKey = subscriptionKey;
  roomSubscription = client.onUpdate(
    api.rooms.getRoomState,
    args,
    (snapshot) => {
      try {
        applyRoomSnapshot(snapshot);
      } catch (error) {
        showError('landing-error', error.message || 'Room not found.');
        setView('landing');
      }
    },
    (error) => {
      showError('opinion-error', error.message || 'Realtime sync disconnected.');
    }
  );
}

async function refreshRoomState() {
  const args = getRoomStateArgs();
  if (!args) {
    return;
  }

  const snapshot = await convexQuery(api.rooms.getRoomState, args);
  applyRoomSnapshot(snapshot);
}

async function createRoom() {
  clearError('create-error');
  setStatus('create-status', '');
  clearInputInvalid('host-name', 'room-topic');

  const hostName = document.getElementById('host-name').value.trim();
  const topic = document.getElementById('room-topic').value.trim();

  if (!hostName || !topic) {
    setInputInvalid('host-name', !hostName);
    setInputInvalid('room-topic', !topic);
    showError('create-error', 'Enter your name and a topic.');
    return;
  }

  setButtonBusy('btn-do-create-room', true, 'Creating...', 'Create room');
  setStatus('create-status', 'Creating room...');
  try {
    logAgentEvent('createRoom:start', { hasHostName: !!hostName, topicLength: topic.length });
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
    await ensureRoomSubscription();

    document.getElementById('display-room-code').textContent = result.code;
    setView('room-created');
    await loadRoomShareAssets(result.code, result.joinUrl);
    setStatus('create-status', '');
  } catch (error) {
    logAgentEvent('createRoom:failed', { errorMessage: error?.message ?? 'unknown' });
    showError('create-error', error.message || 'Could not create the room.');
    setStatus('create-status', '');
  } finally {
    setButtonBusy('btn-do-create-room', false, 'Creating...', 'Create room');
  }
}

async function joinRoom() {
  clearError('landing-error');
  setStatus('landing-status', '');
  clearInputInvalid('join-code', 'join-name');

  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();

  if (!code || !name) {
    setInputInvalid('join-code', !code);
    setInputInvalid('join-name', !name);
    showError('landing-error', 'Enter a code and your name.');
    return;
  }

  setButtonBusy('btn-join-room', true, 'Joining...', 'Join');
  setStatus('landing-status', 'Joining room...');
  try {
    const room = await convexQuery(api.rooms.getRoomByCode, { code });
    if (!room) {
      throw new Error('Room not found. Check the code and try again.');
    }

    const result = await convexMutation(api.rooms.joinRoom, { code, name });

    state.roomId = result.roomId;
    state.roomCode = code;
    state.hostToken = null;
    state.joinToken = result.joinToken;
    state.isHost = false;
    state.participantName = name;
    state.participantId = result.participantId;
    state.viewerHasSubmitted = false;

    await ensureRoomSubscription();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await refreshRoomState();
        break;
      } catch (error) {
        if (attempt === 2) {
          throw error;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    }

    resetOpinionComposer();
    setView('room');
    syncAnalysisState();
    setStatus('landing-status', '');
  } catch (error) {
    showError('landing-error', error.message || 'Could not join that room.');
    setStatus('landing-status', '');
  } finally {
    setButtonBusy('btn-join-room', false, 'Joining...', 'Join');
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
    const mutationRef = state.viewerHasSubmitted
      ? api.opinions.updateOpinion
      : api.opinions.submitOpinion;

    await convexMutation(mutationRef, {
      roomId: state.roomId,
      joinToken: state.joinToken,
      choice,
      reason: reason || undefined,
      attachmentIds: [],
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
    setStatus('opinion-status', 'Analysis started. Everyone in the room will update automatically.');
  } catch (error) {
    loadingEl.hidden = true;
    showError('opinion-error', error.message || 'Could not run analysis.');
  }
}

async function restoreExistingSession() {
  const session = hydrateSession();

  logAgentEvent('restoreExistingSession:start', { hasSession: !!session });

  if (!session?.roomId || !session?.joinToken) {
    return;
  }

  state.roomId = session.roomId;
  state.roomCode = session.roomCode ?? null;
  state.hostToken = session.hostToken ?? null;
  state.joinToken = session.joinToken;

  try {
    await ensureRoomSubscription();
    await refreshRoomState();
    resetOpinionComposer();
    setView('room');
    syncAnalysisState();
  } catch {
    logAgentEvent('restoreExistingSession:failed', {
      hasRoomId: state.roomId != null,
      hasHostToken: !!state.hostToken,
    });
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
  await ensureRoomSubscription();
  await refreshRoomState();
  resetOpinionComposer();
  setView('room');
  syncAnalysisState();
});

document.getElementById('btn-copy-code').addEventListener('click', async () => {
  await copyText(document.getElementById('display-room-code').textContent, {
    statusId: 'share-status',
    buttonId: 'btn-copy-code',
    successMessage: 'Code copied.',
  });
});

document.getElementById('btn-copy-link').addEventListener('click', async () => {
  await copyText(document.getElementById('display-join-link').value, {
    statusId: 'share-status',
    buttonId: 'btn-copy-link',
    successMessage: 'Link copied.',
  });
});

document.getElementById('btn-copy-code-inroom').addEventListener('click', async () => {
  await copyText(state.roomCode ?? '', {
    statusId: 'opinion-status',
    buttonId: 'btn-copy-code-inroom',
    successMessage: 'Invite code copied.',
  });
});

document.getElementById('btn-copy-link-inroom').addEventListener('click', async () => {
  await copyText(`${window.location.origin}/?code=${encodeURIComponent(state.roomCode ?? '')}`, {
    statusId: 'opinion-status',
    buttonId: 'btn-copy-link-inroom',
    successMessage: 'Invite link copied.',
  });
});

RESPONSE_BUTTON_IDS.forEach((id) => {
  document.getElementById(id).addEventListener('click', () => showOpinionInput(id));
});

document.getElementById('btn-submit-opinion').addEventListener('click', submitOrUpdateResponse);
document.getElementById('opinions-list').addEventListener('click', handleReactionClick);
document.getElementById('btn-analyze').addEventListener('click', startAnalysis);
document.getElementById('btn-back-to-room').addEventListener('click', () => setView('room'));
document.getElementById('btn-new-room').addEventListener('click', () => {
  if (roomSubscription) {
    roomSubscription();
    roomSubscription = null;
    roomSubscriptionKey = null;
  }
  clearSession();
  state.roomId = null;
  state.roomCode = null;
  state.hostToken = null;
  state.joinToken = null;
  state.isHost = false;
  state.topic = '';
  state.participantName = '';
  state.participantId = null;
  state.viewerHasSubmitted = false;
  state.opinions = [];
  state.reactionsByOpinionId = {};
  state.selectedOpinionIcon = null;
  state.latestAnalysis = null;
  setView('landing');
});

prefillJoinCodeFromUrl();
setView('landing');
restoreExistingSession();
