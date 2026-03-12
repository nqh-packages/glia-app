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

function renderSpectrum(spectrum, topic) {
  const el = document.getElementById('spectrum');
  el.innerHTML = `
    <h2>${topic}</h2>
    <div class="spectrum-bar">
      <div class="spectrum-for" style="width: ${spectrum.for_percentage}%">
        ${spectrum.for_percentage}% For
      </div>
      <div class="spectrum-against" style="width: ${spectrum.against_percentage}%">
        ${spectrum.against_percentage}% Against
      </div>
    </div>
    <div class="themes">
      <h3>Key Themes</h3>
      <ul>
        ${spectrum.key_themes.map(t => `<li>${t.theme} (${t.mention_count} mentions)</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderCamps(camps) {
  const el = document.getElementById('camps');
  el.innerHTML = camps.map(camp => `
    <div class="camp camp--${camp.sentiment}">
      <h3>${camp.label} (${camp.supporter_count} people)</h3>
      <p class="camp-position">${camp.position}</p>
      <h4>Reasons:</h4>
      <ul>
        ${camp.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
      ${camp.representative_quotes?.length ? `
        <h4>Quotes:</h4>
        <blockquote>
          ${camp.representative_quotes.map(q => `<p>"${q}"</p>`).join('')}
        </blockquote>
      ` : ''}
    </div>
  `).join('');
}

function renderCompromise(compromise) {
  const el = document.getElementById('compromise');
  el.innerHTML = `
    <h2>Compromise</h2>
    <p class="compromise-summary">${compromise.summary}</p>
    <p class="compromise-details">${compromise.details}</p>
    <div class="addresses">
      <h3>How this addresses each side:</h3>
      ${compromise.addresses.map(a => `
        <div class="address">
          <strong>${a.camp}:</strong> ${a.how_addressed}
        </div>
      `).join('')}
    </div>
  `;
}
