/* MagicScript — drop-in AI chat widget (demo build).
   Host pages can expose actions via window.MagicScriptActions = { actionName: fn }. */
(function () {
  const STORAGE_KEY = "magicscript-history";
  const API_KEY_STORAGE = "magicscript-api-key";
  const MODEL = "claude-opus-4-8";
  const GEMINI_MODEL = "gemini-flash-latest";
  const SYSTEM_PROMPT = `You are MagicScript, the AI assistant embedded on the MagicScript landing page (magicscript.ai).

About the product you live on: MagicScript is a drop-in script — one <script> tag — that adds an AI chatbot to the bottom-right corner of any website. Once installed it integrates with the host site/web app and can: answer questions about the site, display the user's data in that site (e.g. "show my sales chart for March 3rd" on a dashboard site opens a generated page with that chart), and execute changes in the web app. Host sites expose capabilities by registering functions on window.MagicScriptActions. It keeps chat history per site (localStorage), is installed in one line, and this very chat is a live demo of it.

This demo site registered one action for you — changing the site's language. Supported codes: en, es, fr, de, pt, it, nl, ru, zh, ja, ko, ar, hi, tr, pl. To change the language, include the exact token [[setLanguage:CODE]] anywhere in your reply (it will be executed and hidden from the user). Example: user says "ponlo en español" → reply "¡Listo! El sitio ahora está en español. [[setLanguage:es]]". Only use it when the user asks for a language change.

Style: reply in the user's language, be friendly and concise (1-3 short sentences), plain text only — no markdown. If asked about pricing or signup, say this is a demo site.`;

  const css = `
    #ms-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:9999px;
      background:#4f46e5;color:#fff;border:none;cursor:pointer;font-size:22px;
      box-shadow:0 10px 25px rgba(79,70,229,.45);z-index:9999;transition:transform .15s}
    #ms-btn:hover{transform:scale(1.08)}
    #ms-panel{position:fixed;bottom:94px;right:24px;width:340px;max-width:calc(100vw - 32px);
      height:440px;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);
      display:none;flex-direction:column;overflow:hidden;z-index:9999;
      font-family:ui-sans-serif,system-ui,sans-serif}
    #ms-panel.open{display:flex;transform-origin:bottom right;
      animation:ms-pop .42s cubic-bezier(.34,1.56,.64,1) backwards}
    #ms-panel.closing{animation:ms-out .18s ease-in forwards}
    @keyframes ms-pop{from{opacity:0;transform:translateY(36px) scale(.45)}}
    @keyframes ms-out{to{opacity:0;transform:translateY(24px) scale(.8)}}
    #ms-panel.open #ms-head{animation:ms-drop .45s .10s cubic-bezier(.34,1.56,.64,1) backwards}
    #ms-panel.open #ms-form{animation:ms-rise .5s .22s cubic-bezier(.34,1.56,.64,1) backwards}
    @keyframes ms-drop{from{opacity:0;transform:translateY(-16px)}}
    @keyframes ms-rise{from{opacity:0;transform:translateY(18px)}}
    .ms-typing{letter-spacing:3px;animation:ms-pulse 1s ease-in-out infinite !important}
    @keyframes ms-pulse{0%,100%{opacity:.35}50%{opacity:1}}
    .ms-msg{animation:ms-msg-in .38s cubic-bezier(.34,1.56,.64,1) backwards}
    @keyframes ms-msg-in{from{opacity:0;transform:translateY(14px) scale(.9)}}
    @media (prefers-reduced-motion:reduce){
      #ms-panel.open,#ms-panel.closing,#ms-panel.open #ms-head,#ms-panel.open #ms-form,.ms-msg{animation:none}}
    #ms-head{background:#4f46e5;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px}
    #ms-head .ms-title{font-weight:600;flex:1;font-size:14px}
    #ms-head button{background:none;border:none;color:#c7d2fe;cursor:pointer;font-size:14px}
    #ms-head button:hover{color:#fff}
    #ms-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}
    .ms-msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap}
    .ms-user{align-self:flex-end;background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
    .ms-bot{align-self:flex-start;background:#e2e8f0;color:#0f172a;border-bottom-left-radius:4px}
    #ms-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e2e8f0;background:#fff}
    #ms-input{flex:1;border:1px solid #cbd5e1;border-radius:9999px;padding:8px 14px;font-size:13px;outline:none;
      background:#fff;color:#0f172a}
    #ms-input::placeholder{color:#94a3b8}
    #ms-input:focus{border-color:#4f46e5}
    #ms-send{background:#4f46e5;color:#fff;border:none;border-radius:9999px;width:36px;height:36px;cursor:pointer}
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "ms-btn";
  btn.innerHTML = '<img src="logo.svg" alt="MagicScript" class="invert" style="width:34px;height:34px;display:block;margin:auto">';
  btn.title = "Chat with MagicScript";

  const panel = document.createElement("div");
  panel.id = "ms-panel";
  panel.innerHTML = `
    <div id="ms-head">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span class="ms-title">MagicScript</span>
      <button id="ms-apikey" title="Set Anthropic API key"><i class="fa-solid fa-key"></i></button>
      <button id="ms-clear" title="Clear history"><i class="fa-solid fa-trash"></i></button>
      <button id="ms-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="ms-log"></div>
    <form id="ms-form">
      <input id="ms-input" autocomplete="off" placeholder="Ask me anything…">
      <button id="ms-send" type="submit"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector("#ms-log");
  const form = panel.querySelector("#ms-form");
  const input = panel.querySelector("#ms-input");

  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) {}

  function render(msg) {
    const div = document.createElement("div");
    div.className = "ms-msg " + (msg.role === "user" ? "ms-user" : "ms-bot");
    div.textContent = msg.text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function push(role, text) {
    const msg = { role, text };
    history.push(msg);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    render(msg);
  }

  function reply(text) { setTimeout(() => push("bot", text), 300); }

  function runActions(text) {
    // execute action tokens Claude emits, then hide them from the user
    const actions = window.MagicScriptActions || {};
    return text.replace(/\[\[setLanguage:([a-z-]+)\]\]/gi, (_, code) => {
      if (actions.setLanguage) actions.setLanguage(code.toLowerCase());
      return "";
    }).replace(/\s{2,}/g, " ").trim();
  }

  function showTyping() {
    const typing = document.createElement("div");
    typing.className = "ms-msg ms-bot ms-typing";
    typing.textContent = "•••";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    return typing;
  }

  async function askClaude(apiKey) {
    const typing = showTyping();
    try {
      // last 20 turns; the API requires the first message to be from the user
      const msgs = history.slice(-20).map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
      while (msgs.length && msgs[0].role !== "user") msgs.shift();

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: msgs,
        }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok) {
        push("bot", "⚠️ " + (data.error && data.error.message ? data.error.message : "API error " + res.status));
        return;
      }
      if (data.stop_reason === "refusal") {
        push("bot", "Sorry, I can't help with that one.");
        return;
      }
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      push("bot", runActions(text) || "Done! ✨");
    } catch (err) {
      typing.remove();
      push("bot", "⚠️ Couldn't reach Claude. Check your connection and API key (🔑 in the header).");
    }
  }

  async function askGemini(apiKey) {
    const typing = showTyping();
    try {
      const contents = history.slice(-20).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));
      while (contents.length && contents[0].role !== "user") contents.shift();

      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: 1024 },
          }),
        }
      );
      const data = await res.json();
      typing.remove();

      if (!res.ok) {
        push("bot", "⚠️ " + (data.error && data.error.message ? data.error.message : "API error " + res.status));
        return;
      }
      const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
      const text = parts.map(p => p.text || "").join("");
      push("bot", runActions(text) || "Sorry, I couldn't answer that one.");
    } catch (err) {
      typing.remove();
      push("bot", "⚠️ Couldn't reach Gemini. Check your connection and API key (🔑 in the header).");
    }
  }

  // Anthropic keys start with sk-ant-; Google AI Studio keys with AIza or AQ.
  function isGeminiKey(key) { return /^(AIza|AQ\.)/.test(key); }

  function askAI(apiKey) {
    if (isGeminiKey(apiKey)) askGemini(apiKey);
    else askClaude(apiKey);
  }

  function answer(q) {
    const t = q.toLowerCase();
    const actions = window.MagicScriptActions || {};

    // Action: change site language (works because this site registered the action)
    const LANGS = [
      { code: "en", confirm: "Done! The site is now in English. 🇬🇧", names: ["english", "inglés", "ingles", "anglais", "englisch", "англий", "英文", "英語", "영어", "الإنجليزية", "अंग्रेज़ी", "angielski", "ingilizce"] },
      { code: "es", confirm: "¡Listo! El sitio ahora está en español. 🇪🇸", names: ["spanish", "español", "espanol", "castellano", "espagnol", "spanisch"] },
      { code: "fr", confirm: "C'est fait ! Le site est maintenant en français. 🇫🇷", names: ["french", "français", "francais", "francés", "frances", "französisch"] },
      { code: "de", confirm: "Fertig! Die Seite ist jetzt auf Deutsch. 🇩🇪", names: ["german", "deutsch", "alemán", "aleman", "allemand"] },
      { code: "pt", confirm: "Pronto! O site agora está em português. 🇵🇹", names: ["portuguese", "português", "portugues"] },
      { code: "it", confirm: "Fatto! Il sito ora è in italiano. 🇮🇹", names: ["italian", "italiano", "italien"] },
      { code: "nl", confirm: "Klaar! De site is nu in het Nederlands. 🇳🇱", names: ["dutch", "nederlands", "holandés", "holandes", "néerlandais"] },
      { code: "ru", confirm: "Готово! Сайт теперь на русском. 🇷🇺", names: ["russian", "русский", "по-русски", "ruso", "russe", "russisch"] },
      { code: "zh", confirm: "好了！网站已切换为中文。🇨🇳", names: ["chinese", "中文", "汉语", "mandarin", "chino", "chinois"] },
      { code: "ja", confirm: "完了！サイトは日本語になりました。🇯🇵", names: ["japanese", "日本語", "japonés", "japones", "japonais"] },
      { code: "ko", confirm: "완료! 사이트가 한국어로 바뀌었어요. 🇰🇷", names: ["korean", "한국어", "coreano", "coréen"] },
      { code: "ar", confirm: "تم! الموقع الآن بالعربية. 🇸🇦", names: ["arabic", "العربية", "عربي", "árabe", "arabe", "arabisch"] },
      { code: "hi", confirm: "हो गया! साइट अब हिन्दी में है। 🇮🇳", names: ["hindi", "हिन्दी", "हिंदी"] },
      { code: "tr", confirm: "Tamam! Site artık Türkçe. 🇹🇷", names: ["turkish", "türkçe", "turkce", "turco", "turc"] },
      { code: "pl", confirm: "Gotowe! Strona jest teraz po polsku. 🇵🇱", names: ["polish", "polski", "polaco", "polonais", "polnisch"] }
    ];
    for (const lang of LANGS) {
      if (lang.names.some(n => t.includes(n))) {
        if (actions.setLanguage && actions.setLanguage(lang.code)) return reply(lang.confirm);
        return reply("This site doesn't support that language yet.");
      }
    }
    if (/language|idioma|langue|sprache|язык|语言|言語|언어|لغة|भाषा|dil|język/.test(t)) {
      return reply('I speak 15 languages — try "switch to French", "日本語にして" or "cambia a árabe".');
    }

    if (/what.*(can|do)|capab|feature|able/.test(t)) {
      return reply(
        "I'm MagicScript. On any site that installs me, I can:\n" +
        "• Answer questions about the site\n" +
        "• Show a user's data (e.g. \"show my sales chart for March\")\n" +
        "• Take actions — navigate, generate pages, change settings\n" +
        "• Remember our previous chats\n\n" +
        "Try me: ask me to switch this site to any of 15 languages!"
      );
    }
    if (/install|add|setup|set up|integrat|how.*(use|work)/.test(t)) {
      return reply(
        'One line:\n<script src="https://magicscript.ai/widget.js"></script>\n\n' +
        "Then optionally register actions:\nwindow.MagicScriptActions = { setLanguage, showChart, ... }"
      );
    }
    if (/history|remember|previous|memory/.test(t)) {
      return reply("Yes — I keep your chat history on this site. Close the tab, come back, and it's still here.");
    }
    if (/chart|data|graph/.test(t)) {
      return reply("On a data-heavy site I'd fetch that chart and open a page with it. Here on the demo, try the language switch instead!");
    }
    if (/price|cost|free/.test(t)) {
      return reply("This is a demo — pricing is up to your imagination. 😄");
    }
    if (/\b(hi|hello|hola|hey|bonjour|hallo|ciao|olá|привет|你好|こんにちは|안녕|مرحبا|merhaba|cześć)\b/.test(t)) {
      return reply("Hey! 👋 Ask me what I can do, or tell me to switch this site to another language.");
    }
    reply('Not sure about that one (demo mode). Try "what can you do?", "switch to French" — or add an API key (🔑) for real AI answers.');
  }

  function openPanel() {
    panel.classList.remove("closing");
    panel.classList.add("open");
    if (!log.hasChildNodes()) {
      history.forEach(render);
      if (!history.length) push("bot", "Hi! I'm MagicScript — the assistant living on this site. Ask me what I can do. ✨\n\nTip: click the 🔑 icon and paste an API key to power me with real AI — Gemini keys are free at aistudio.google.com.");
    }
    // cascade: replay each message's entrance at a staggered delay
    Array.from(log.children).forEach((el, i) => {
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
      el.style.animationDelay = Math.min(160 + i * 60, 560) + "ms";
    });
    input.focus();
  }

  function closePanel() {
    panel.classList.add("closing");
    setTimeout(() => panel.classList.remove("open", "closing"), 170);
  }

  btn.addEventListener("click", () => {
    panel.classList.contains("open") ? closePanel() : openPanel();
  });

  panel.querySelector("#ms-close").addEventListener("click", closePanel);

  panel.querySelector("#ms-clear").addEventListener("click", () => {
    history = [];
    localStorage.removeItem(STORAGE_KEY);
    log.innerHTML = "";
    push("bot", "History cleared. Fresh start! ✨");
  });

  panel.querySelector("#ms-apikey").addEventListener("click", () => {
    const current = localStorage.getItem(API_KEY_STORAGE);
    const key = prompt("Paste your API key — Anthropic (sk-ant-...) or Google AI Studio (AIza..., free at aistudio.google.com). Leave empty to remove it.", current || "");
    if (key === null) return;
    if (key.trim()) {
      localStorage.setItem(API_KEY_STORAGE, key.trim());
      push("bot", "Key saved — I'm now powered by " + (isGeminiKey(key.trim()) ? "Gemini" : "Claude") + ". Ask me anything! ✨");
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
      push("bot", "Key removed. Back to demo mode.");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    if (/^(sk-ant-|AIza|AQ\.)/.test(q)) {
      localStorage.setItem(API_KEY_STORAGE, q);
      push("user", "•••••• (API key)");
      reply("Key saved — I'm now powered by " + (isGeminiKey(q) ? "Gemini" : "Claude") + ". Ask me anything! ✨");
      return;
    }
    push("user", q);
    const apiKey = localStorage.getItem(API_KEY_STORAGE);
    if (apiKey) askAI(apiKey);
    else answer(q);
  });
})();
