// Valentina (HTML/CSS) + Francisco (data logic): render analysis results

/**
 * Render the full GliaOutput to the page.
 * @param {object} result — matches output.schema.json
 */
export function renderResults(result) {
  renderSpectrum(result.spectrum, result.topic);
  renderCamps(result.camps);
  renderCompromise(result.compromise);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function renderSpectrum(spectrum, topic) {
  const el = document.getElementById('spectrum');
  el.innerHTML = `
    <div class="spectrum-shell">
      <h2 class="results-topic">${escapeHtml(topic)}</h2>
      <div class="spectrum-bar">
        <div class="spectrum-segment spectrum-for" style="width: ${spectrum.yes_percentage}%">
          <strong>${spectrum.yes_percentage}%</strong>
          <span>Yes</span>
        </div>
        <div class="spectrum-segment spectrum-neutral" style="width: ${spectrum.neutral_percentage}%">
          <strong>${spectrum.neutral_percentage}%</strong>
          <span>Neutral</span>
        </div>
        <div class="spectrum-segment spectrum-against" style="width: ${spectrum.no_percentage}%">
          <strong>${spectrum.no_percentage}%</strong>
          <span>No</span>
        </div>
      </div>
      <div class="spectrum-legend">
        <div class="spectrum-stat spectrum-stat--yes">
          <span class="spectrum-stat__label">Yes</span>
          <strong class="spectrum-stat__value">${spectrum.yes_percentage}%</strong>
        </div>
        <div class="spectrum-stat spectrum-stat--neutral">
          <span class="spectrum-stat__label">Neutral</span>
          <strong class="spectrum-stat__value">${spectrum.neutral_percentage}%</strong>
        </div>
        <div class="spectrum-stat spectrum-stat--no">
          <span class="spectrum-stat__label">No</span>
          <strong class="spectrum-stat__value">${spectrum.no_percentage}%</strong>
        </div>
      </div>
      <div class="themes">
        <h3>Key Themes</h3>
        <ul class="theme-list">
          ${spectrum.key_themes.map((theme) => `
            <li>${escapeHtml(theme.theme)} (${theme.mention_count} mentions)</li>
          `).join('')}
        </ul>
      </div>
    </div>
  `;
}

function renderCamps(camps) {
  const el = document.getElementById('camps');
  el.innerHTML = camps.map((camp) => `
    <div class="camp camp--${camp.sentiment}">
      <div class="camp-header">
        <h3>${escapeHtml(camp.label)}</h3>
        <span class="camp-meta">${camp.supporter_count} people</span>
      </div>
      <p class="camp-position">${escapeHtml(camp.position)}</p>
      <h4>Reasons:</h4>
      <ul>
        ${camp.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}
      </ul>
      ${camp.representative_quotes?.length ? `
        <h4>Quotes:</h4>
        <blockquote>
          ${camp.representative_quotes.map((quote) => `<p>"${escapeHtml(quote)}"</p>`).join('')}
        </blockquote>
      ` : ''}
    </div>
  `).join('');
}

function renderCompromise(compromise) {
  const el = document.getElementById('compromise');
  el.innerHTML = `
    <h2>Compromise</h2>
    <p class="compromise-summary">${escapeHtml(compromise.summary)}</p>
    <p class="compromise-details">${escapeHtml(compromise.details)}</p>
    <div class="addresses">
      <h3>How this addresses each side:</h3>
      ${compromise.addresses.map((address) => `
        <div class="address">
          <strong>${escapeHtml(address.camp)}:</strong> ${escapeHtml(address.how_addressed)}
        </div>
      `).join('')}
    </div>
  `;
}
