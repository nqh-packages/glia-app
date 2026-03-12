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
    <h2>${escapeHtml(topic)}</h2>
    <div class="spectrum-bar">
      <div class="spectrum-for" style="width: ${spectrum.yes_percentage}%">
        ${spectrum.yes_percentage}% Yes
      </div>
      <div class="spectrum-neutral" style="width: ${spectrum.neutral_percentage}%">
        ${spectrum.neutral_percentage}% Neutral
      </div>
      <div class="spectrum-against" style="width: ${spectrum.no_percentage}%">
        ${spectrum.no_percentage}% No
      </div>
    </div>
    <div class="themes">
      <h3>Key Themes</h3>
      <ul>
        ${spectrum.key_themes.map((theme) => `
          <li>${escapeHtml(theme.theme)} (${theme.mention_count} mentions)</li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderCamps(camps) {
  const el = document.getElementById('camps');
  el.innerHTML = camps.map((camp) => `
    <div class="camp camp--${camp.sentiment}">
      <h3>${escapeHtml(camp.label)} (${camp.supporter_count} people)</h3>
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
