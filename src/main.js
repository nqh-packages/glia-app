// Francisco: wire UI to Convex + view switching
// App entry: landing → create/join → room → results

import { renderResults } from './renderer.js';

const app = document.getElementById('app');

// #region agent log
fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:init',message:'script run',data:{appExists:!!app,dataView:app?.dataset?.view,viewCount:document.querySelectorAll('.view').length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
// #endregion

// --- View switching ---
function setView(viewId) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/fa1b5525-06c8-44e5-99a4-e646f6ad2a35',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.js:setView',message:'setView called',data:{viewId,appExists:!!app},timestamp:Date.now(),hypothesisId:'H1',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  app.dataset.view = viewId;
}

setView('landing');

// --- Stub state (replace with Convex when ready) ---
let state = {
  roomCode: null,
  hostToken: null,
  joinToken: null,
  isHost: false,
  topic: '',
  participantName: '',
  opinions: [],
  selectedOpinionIcon: null,
  myVotes: {},
};

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// --- Landing ---
document.getElementById('btn-create-room').addEventListener('click', () => {
  setView('create');
  document.getElementById('create-error').hidden = true;
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const name = document.getElementById('join-name').value.trim();
  const errEl = document.getElementById('landing-error');
  if (!code || !name) {
    errEl.textContent = 'Enter a code and your name.';
    errEl.hidden = false;
    return;
  }
  // Stub: accept any code and go to room
  state.roomCode = code;
  state.joinToken = 'stub-' + Math.random().toString(36).slice(2);
  state.isHost = false;
  state.topic = 'Discussion topic (joined by code)';
  state.participantName = name;
  state.opinions = [];
  errEl.hidden = true;
  enterRoomView();
});

// --- Create room ---
document.getElementById('btn-back-landing').addEventListener('click', () => setView('landing'));

document.getElementById('btn-do-create-room').addEventListener('click', () => {
  const hostName = document.getElementById('host-name').value.trim();
  const topic = document.getElementById('room-topic').value.trim();
  const errEl = document.getElementById('create-error');
  if (!hostName || !topic) {
    errEl.textContent = 'Enter your name and a topic.';
    errEl.hidden = false;
    return;
  }
  state.roomCode = randomCode();
  state.hostToken = 'stub-host-' + Math.random().toString(36).slice(2);
  state.isHost = true;
  state.topic = topic;
  state.participantName = hostName;
  state.opinions = [];
  errEl.hidden = true;

  document.getElementById('display-room-code').textContent = state.roomCode;
  const origin = window.location.origin + window.location.pathname;
  document.getElementById('display-join-link').value = `${origin}?join=${state.roomCode}`;
  setView('room-created');
});

// --- Room created → Enter room ---
document.getElementById('btn-enter-room-as-host').addEventListener('click', () => enterRoomView());

document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('display-room-code').textContent;
  navigator.clipboard.writeText(code).then(() => { /* optional: show "Copied" */ });
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
  const link = document.getElementById('display-join-link').value;
  navigator.clipboard.writeText(link).then(() => {});
});

// --- Room view ---
function enterRoomView() {
  setView('room');
  document.getElementById('room-topic-title').textContent = state.topic;
  document.getElementById('room-code-badge').textContent = state.roomCode;
  document.getElementById('room-code-inroom').textContent = state.roomCode;
  document.getElementById('room-role').textContent = state.isHost ? '(Host)' : '(Participant)';
  document.getElementById('host-actions').hidden = !state.isHost;
  document.getElementById('loading').hidden = true;
  document.getElementById('room-opinion-input').hidden = true;
  state.selectedOpinionIcon = null;
  ['btn-opinion-thumb-up', 'btn-opinion-chat', 'btn-opinion-thumb-down'].forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });
  renderOpinionsList();
  document.getElementById('opinion-text').value = '';
  document.getElementById('opinion-status').textContent = '';
  document.getElementById('opinion-error').hidden = true;
}

function showOpinionInput(iconButtonId) {
  state.selectedOpinionIcon = iconButtonId;
  ['btn-opinion-thumb-up', 'btn-opinion-chat', 'btn-opinion-thumb-down'].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', id === iconButtonId);
  });
  const el = document.getElementById('room-opinion-input');
  el.hidden = false;
  document.getElementById('opinion-text').focus();
}

function renderOpinionsList() {
  const list = document.getElementById('opinions-list');
  const empty = document.getElementById('opinions-empty');
  list.innerHTML = '';
  state.opinions.forEach((op, i) => {
    const myVote = state.myVotes[i];
    const card = document.createElement('div');
    card.className = 'opinion-card';
    card.innerHTML = `
      <p class="opinion-text">${escapeHtml(op.text)}</p>
      <p class="opinion-meta">${escapeHtml(op.author)} · ${op.upvoteCount ?? 0} ↑ ${op.downvoteCount ?? 0} ↓</p>
      <div class="opinion-votes">
        <button type="button" class="vote-btn ${myVote === 1 ? 'active' : ''}" data-opinion-id="${i}" data-vote="1">↑ Up</button>
        <span class="vote-count"></span>
        <button type="button" class="vote-btn ${myVote === -1 ? 'active' : ''}" data-opinion-id="${i}" data-vote="-1">↓ Down</button>
      </div>
    `;
    list.appendChild(card);
  });
  empty.hidden = state.opinions.length > 0;
}

document.getElementById('opinions-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.vote-btn[data-opinion-id][data-vote]');
  if (!btn) return;
  const i = parseInt(btn.dataset.opinionId, 10);
  const value = parseInt(btn.dataset.vote, 10);
  const op = state.opinions[i];
  if (!op) return;
  const prev = state.myVotes[i];
  state.myVotes[i] = prev === value ? undefined : value;
  op.upvoteCount = (op.upvoteCount ?? 0) - (prev === 1 ? 1 : 0) + (state.myVotes[i] === 1 ? 1 : 0);
  op.downvoteCount = (op.downvoteCount ?? 0) - (prev === -1 ? 1 : 0) + (state.myVotes[i] === -1 ? 1 : 0);
  renderOpinionsList();
});

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

document.getElementById('btn-submit-opinion').addEventListener('click', () => {
  const text = document.getElementById('opinion-text').value.trim();
  const errEl = document.getElementById('opinion-error');
  const statusEl = document.getElementById('opinion-status');
  if (!text) {
    errEl.textContent = 'Write your opinion first.';
    errEl.hidden = false;
    return;
  }
  state.opinions.push({
    text,
    author: state.participantName,
    upvoteCount: 0,
    downvoteCount: 0,
  });
  document.getElementById('opinion-text').value = '';
  errEl.hidden = true;
  statusEl.textContent = 'Submitted.';
  renderOpinionsList();
});

document.getElementById('btn-copy-code-inroom').addEventListener('click', () => {
  navigator.clipboard.writeText(state.roomCode);
});

['btn-opinion-thumb-up', 'btn-opinion-chat', 'btn-opinion-thumb-down'].forEach((id) => {
  document.getElementById(id).addEventListener('click', () => showOpinionInput(id));
});

// Analyze (host): stub with mock result, then show results view
const loadingEl = document.getElementById('loading');
const mockResult = {
  topic: state.topic,
  camps: [
    { label: 'In favor', position: 'Support the proposal.', supporter_count: 2, reasons: ['Benefit A', 'Benefit B'], sentiment: 'for' },
    { label: 'Cautious', position: 'Need more details first.', supporter_count: 1, reasons: ['Uncertainty'], sentiment: 'neutral' },
  ],
  spectrum: {
    for_percentage: 55,
    against_percentage: 45,
    key_themes: [{ theme: 'Impact', mention_count: 3 }, { theme: 'Cost', mention_count: 2 }],
  },
  compromise: {
    summary: 'Proceed in phases with clear metrics.',
    details: 'Start with a pilot and review before full rollout.',
    addresses: [
      { camp: 'In favor', how_addressed: 'Moves forward with a pilot.' },
      { camp: 'Cautious', how_addressed: 'Limits risk and allows review.' },
    ],
  },
};

document.getElementById('btn-analyze').addEventListener('click', () => {
  loadingEl.hidden = false;
  setTimeout(() => {
    renderResults(mockResult);
    loadingEl.hidden = true;
    setView('results');
  }, 800);
});

document.getElementById('btn-back-to-room').addEventListener('click', () => enterRoomView());
