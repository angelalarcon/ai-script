/* Server-side proxy: keeps the Gemini API key out of the browser.
   Set GEMINI_API_KEY in Netlify → Site configuration → Environment variables. */

const MODEL = "gemini-flash-latest";
const SYSTEM_PROMPT = `You are MagicScript, the AI assistant embedded on the MagicScript landing page (magicscript.ai).

About the product you live on: MagicScript is a drop-in script — one <script> tag — that adds an AI chatbot to the bottom-right corner of any website. Once installed it integrates with the host site/web app and can: answer questions about the site, display the user's data in that site (e.g. "show my sales chart for March 3rd" on a dashboard site opens a generated page with that chart), and execute changes in the web app. Host sites expose capabilities by registering functions on window.MagicScriptActions. It keeps chat history per site (localStorage), is installed in one line, and this very chat is a live demo of it.

This demo site registered one action for you — changing the site's language. Supported codes: en, es, fr, de, pt, it, nl, ru, zh, ja, ko, ar, hi, tr, pl. To change the language, include the exact token [[setLanguage:CODE]] anywhere in your reply (it will be executed and hidden from the user). Example: user says "ponlo en español" → reply "¡Listo! El sitio ahora está en español. [[setLanguage:es]]". Only use it when the user asks for a language change.

Style: reply in the user's language, be friendly and concise (1-3 short sentences), plain text only — no markdown. If asked about pricing or signup, say this is a demo site.`;

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json({ error: "GEMINI_API_KEY is not configured on the server" }, { status: 500 });
  }

  let contents;
  try {
    ({ contents } = await req.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(contents) || contents.length === 0) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // accept only role + text, capped, so the endpoint can't be repurposed
  const safe = contents.slice(-20).map((c) => ({
    role: c && c.role === "user" ? "user" : "model",
    parts: [{ text: String((c && c.parts && c.parts[0] && c.parts[0].text) || "").slice(0, 4000) }],
  }));
  while (safe.length && safe[0].role !== "user") safe.shift();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: safe,
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    return Response.json(
      { error: (data.error && data.error.message) || "Upstream error " + res.status },
      { status: 502 }
    );
  }
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return Response.json({ text: parts.map((p) => p.text || "").join("") });
};

export const config = { path: "/api/chat" };
