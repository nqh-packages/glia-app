// Francisco: wire UI to AI here
// This is the app entry point

import { analyzeWithGemini } from './gemini.js';
import { parseTextInput, parseImageInput } from './parser.js';
import { renderResults } from './renderer.js';

const textInput = document.getElementById('text-input');
const imageInput = document.getElementById('image-input');
const analyzeBtn = document.getElementById('analyze-btn');
const resultsSection = document.getElementById('results-section');
const loadingEl = document.getElementById('loading');

analyzeBtn.addEventListener('click', async () => {
  const text = textInput.value.trim();
  const files = imageInput.files;

  if (!text && files.length === 0) {
    alert('Paste some text or upload screenshots first.');
    return;
  }

  // Show loading
  loadingEl.hidden = false;
  resultsSection.hidden = true;

  try {
    // Parse inputs into the contract format
    const entries = [];

    if (text) {
      entries.push(...parseTextInput(text));
    }

    if (files.length > 0) {
      const imageEntries = await parseImageInput(files);
      entries.push(...imageEntries);
    }

    // Send to Gemini
    const result = await analyzeWithGemini({ entries });

    // Render
    renderResults(result);
    resultsSection.hidden = false;
  } catch (err) {
    console.error('Analysis failed:', err);
    alert('Analysis failed. Check console for details.');
  } finally {
    loadingEl.hidden = true;
  }
});
