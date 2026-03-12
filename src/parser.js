// Francisco: input parsing logic

/**
 * Parse raw text into individual opinion entries.
 * Splits by newlines — each line/paragraph is one opinion.
 * @param {string} text
 * @returns {Array<{ content: string, type: string, author?: string }>}
 */
export function parseTextInput(text) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, i) => ({
      content: line,
      type: 'text',
      author: `Person ${i + 1}`
    }));
}

/**
 * Convert uploaded image files to base64 for Gemini multimodal.
 * For now, just sends image descriptions. Upgrade to base64 if time allows.
 * @param {FileList} files
 * @returns {Promise<Array<{ content: string, type: string }>>}
 */
export async function parseImageInput(files) {
  const entries = [];

  for (const file of files) {
    // TODO: Francisco — convert to base64 and send as inline_data to Gemini
    // For now, just note that an image was uploaded
    entries.push({
      content: `[Image uploaded: ${file.name}]`,
      type: 'image_description'
    });
  }

  return entries;
}
