/**
 * Thin wrapper around Groq's OpenAI-compatible chat completions API
 * (free tier). Model + key come from .env (GROQ_API_KEY) — never hardcode
 * the key in source.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile was deprecated/shut down by Groq (announced
// June 2026) — every request to it now fails, which is why the chatbot
// was falling back to "Sorry, I'm having trouble connecting right now".
// openai/gpt-oss-120b is Groq's own recommended replacement.
const MODEL = 'openai/gpt-oss-120b';

async function askGroq(messages) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in .env');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply right now.";
}

module.exports = { askGroq };