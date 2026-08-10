/**
 * Thin wrapper around Groq's OpenAI-compatible chat completions API
 * (free tier). Model + key come from .env (GROQ_API_KEY) — never hardcode
 * the key in source.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile'; // fast + free-tier friendly; swap here if Groq changes tier limits

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
