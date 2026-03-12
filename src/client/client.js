/**
 * Reddit-style sentiment feedback UI — client only, dummy data, no backend.
 * Comments are grouped by category; Send simulates adding a comment with a mock category.
 */

// --- Dummy data: initial comments by category ---
const DUMMY_CATEGORIES = ['Positive', 'Negative', 'Neutral', 'Suggestion'];

const DUMMY_COMMENTS_BY_CATEGORY = {
  Positive: [
    { id: '1', text: 'Really helpful feature, saved me a lot of time.', timestamp: Date.now() - 3600000 },
    { id: '2', text: 'Love the new design, clean and easy to use.', timestamp: Date.now() - 7200000 },
  ],
  Negative: [
    { id: '3', text: 'The app crashes every time I upload a large file.', timestamp: Date.now() - 1800000 },
  ],
  Neutral: [
    { id: '4', text: 'Haven\'t noticed much difference in performance either way.', timestamp: Date.now() - 5400000 },
  ],
  Suggestion: [
    { id: '5', text: 'It would be great to have dark mode and export to PDF.', timestamp: Date.now() - 900000 },
  ],
};

// --- State ---
let commentsByCategory = { ...DUMMY_COMMENTS_BY_CATEGORY };
let loading = false;

// --- DOM ---
const feedbackInput = document.getElementById('feedback-input');
const sendBtn = document.getElementById('send-btn');
const sendStatus = document.getElementById('send-status');
const feedbackError = document.getElementById('feedback-error');
const sentimentGroupsEl = document.getElementById('sentiment-groups');
const emptyStateEl = document.getElementById('empty-state');

// --- Helpers ---
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function getCategorySlug(category) {
  return category.toLowerCase().replace(/\s+/g, '-');
}

/** Simulate API: returns a category (round-robin or random for demo). */
function getDummyCategory() {
  const idx = Math.floor(Math.random() * DUMMY_CATEGORIES.length);
  return DUMMY_CATEGORIES[idx];
}

// --- Render ---
function renderComment(comment) {
  return `
    <div class="comment-card" data-comment-id="${comment.id}">
      <p class="comment-text">${escapeHtml(comment.text)}</p>
      <p class="comment-meta">${formatTime(comment.timestamp)}</p>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderSentimentGroup(category, comments) {
  const slug = getCategorySlug(category);
  const count = comments.length;
  const commentsHtml = comments
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((c) => renderComment(c))
    .join('');
  return `
    <div class="sentiment-group" data-category="${escapeHtml(category)}">
      <div class="sentiment-group-header sentiment-group-header--${slug}">
        <span>${escapeHtml(category)}</span>
        <span class="sentiment-group-count">${count} ${count === 1 ? 'comment' : 'comments'}</span>
      </div>
      <div class="sentiment-group-list">
        ${commentsHtml}
      </div>
    </div>
  `;
}

function render() {
  const categories = Object.keys(commentsByCategory).filter(
    (cat) => commentsByCategory[cat].length > 0
  );
  const hasComments = categories.length > 0;

  sentimentGroupsEl.dataset.empty = hasComments ? 'false' : 'true';
  emptyStateEl.hidden = hasComments;

  if (!hasComments) {
    sentimentGroupsEl.innerHTML = '';
    return;
  }

  sentimentGroupsEl.innerHTML = categories
    .map((cat) => renderSentimentGroup(cat, commentsByCategory[cat]))
    .join('');
}

// --- Send flow (simulated, no backend) ---
function setLoading(value) {
  loading = value;
  sendBtn.disabled = value;
  sendStatus.textContent = value ? 'Analyzing…' : '';
  feedbackError.hidden = true;
}

function setError(message) {
  feedbackError.textContent = message;
  feedbackError.hidden = false;
}

function addCommentToCategory(text, category) {
  if (!commentsByCategory[category]) {
    commentsByCategory[category] = [];
  }
  commentsByCategory[category].push({
    id: generateId(),
    text,
    timestamp: Date.now(),
  });
}

function handleSend() {
  const text = feedbackInput.value.trim();
  if (!text) {
    setError('Please enter a comment.');
    return;
  }

  setLoading(true);
  setError('');

  // Simulate network delay and API returning a category
  setTimeout(() => {
    const category = getDummyCategory();
    addCommentToCategory(text, category);
    feedbackInput.value = '';
    setLoading(false);
    render();
  }, 600);
}

// --- Init ---
sendBtn.addEventListener('click', handleSend);
feedbackInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    handleSend();
  }
});

render();
