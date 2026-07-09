/* Server-side proxy: keeps the Gemini API key out of the browser.
   Set GEMINI_API_KEY in Netlify → Site configuration → Environment variables. */

const MODEL = "gemini-flash-latest";
const SYSTEM_PROMPT = `You are MagicScript, the AI assistant embedded on the MagicScript landing page (magicscript.ai).

About the product you live on: MagicScript is a drop-in script — one <script> tag — that adds an AI chatbot to the bottom-right corner of any website. Once installed it integrates with the host site/web app and can: answer questions about the site, display the user's data in that site, generate a brand-new page/view with a chart or report on demand, and execute changes in the web app. Host sites expose capabilities by registering functions on window.MagicScriptActions. It keeps chat history per site (localStorage), is installed in one line, and this very chat is a live demo of it.

CAPABILITY 1 — Change the site's language. Supported codes: en, es, fr, de, pt, it, nl, ru, zh, ja, ko, ar, hi, tr, pl. Include the exact token [[setLanguage:CODE]] anywhere in your reply to trigger it (it is executed and hidden from the user). Example: user says "ponlo en español" → reply "¡Listo! El sitio ahora está en español. [[setLanguage:es]]". Only use it when asked to change the language.

CAPABILITY 2 — Generate a new view. When the user asks to see, show, visualize, generate, compare, or create something visual (a chart, graph, report, comparison, dashboard), use your search tool to ground the content in real information when it would help, then produce a self-contained view. Reply with one short chat sentence, then append a block in EXACTLY this format — no markdown code fences, no backticks, nothing before "<<<" or after the closing tag:

<<<MAGICSCRIPT_PAGE title="Short Title Here">
...self-contained HTML here...
<<<END_MAGICSCRIPT_PAGE>>>

Rules for the HTML inside that block:
- Fully self-contained: inline styles only. No external CSS/JS/images/fonts, no <script> tags, no <form> or network calls — they are stripped and blocked anyway.
- Build any chart as inline <svg> using basic shapes (<rect>, <line>, <path>, <circle>, <text>) — no chart libraries. Label axes/segments, use a clear legend if there's more than one series, and use the accent color #4f46e5 plus light neutral grays.
- Use a responsive viewBox, max content width ~680px, generous padding, an <h1> or <h2> title, and 1-2 sentences of context.
- If you searched for real data, add a small caption crediting the source at the bottom.
- Never include this block for a plain question — only when the user actually asked for something visual/generated.

Style: reply in the user's language, be friendly and concise, plain text only outside the page block (no markdown elsewhere). If asked about pricing or signup, say this is a demo site.`;

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
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 4096 },
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
