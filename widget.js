/* MagicScript — drop-in AI chat widget (demo build).
   Host pages can expose actions via window.MagicScriptActions = { actionName: fn }. */
(function () {
  const STORAGE_KEY = "magicscript-history";
  const CHAT_ENDPOINT = "/api/chat";

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

    #ms-page{position:fixed;inset:0;background:#020617;color:#e2e8f0;z-index:9990;
      display:none;flex-direction:column;font-family:ui-sans-serif,system-ui,sans-serif}
    #ms-page.open{display:flex;animation:ms-page-in .25s ease-out}
    @keyframes ms-page-in{from{opacity:0;transform:translateY(10px)}}
    #ms-page-head{display:flex;align-items:center;gap:12px;padding:16px 24px;
      border-bottom:1px solid #1e293b;flex-shrink:0}
    #ms-page-head .ms-page-icon{color:#818cf8}
    #ms-page-back{display:inline-flex;align-items:center;gap:6px;background:rgba(79,70,229,.15);
      color:#a5b4fc;border:none;border-radius:9999px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer}
    #ms-page-back:hover{background:rgba(79,70,229,.3);color:#fff}
    #ms-page-title{font-size:15px;font-weight:600;color:#f1f5f9;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ms-page-body{flex:1;overflow-y:auto;padding:36px 24px}
    #ms-page-content{max-width:680px;margin:0 auto}
    #ms-page-content h1{color:#f1f5f9;font-size:32px;font-weight:800;margin:0 0 12px;line-height:1.2}
    #ms-page-content h2{color:#f1f5f9;font-size:21px;font-weight:700;margin:28px 0 10px}
    #ms-page-content h3{color:#f1f5f9;font-size:17px;font-weight:600;margin:20px 0 8px}
    #ms-page-content p{color:#94a3b8;line-height:1.6}
    #ms-page-content i.fa-solid,#ms-page-content i.fa-regular{color:#818cf8}
    #ms-page-content .ms-logo-box{display:inline-block;background:#fff;padding:8px;border-radius:12px;
      line-height:0;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
    #ms-page-content .ms-logo-box img{display:block;max-height:40px;max-width:160px;object-fit:contain;
      border-radius:4px;margin:0 !important}
    #ms-page-content ul,#ms-page-content ol{padding-left:22px;line-height:1.7;color:#cbd5e1}
    #ms-page-content li{margin-bottom:6px}
    @media (prefers-reduced-motion:reduce){#ms-page.open{animation:none}}
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // Ensure Font Awesome is available — the widget's own UI and any AI-generated
  // views use fa-solid icons, but a host site dropping this script in may not
  // have loaded the CDN itself.
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fa = document.createElement("link");
    fa.rel = "stylesheet";
    fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    document.head.appendChild(fa);
  }

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
      <button id="ms-clear" title="Clear history"><i class="fa-solid fa-trash"></i></button>
      <button id="ms-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="ms-log"></div>
    <form id="ms-form">
      <input id="ms-input" autocomplete="off" placeholder="Ask me anything…">
      <button id="ms-send" type="submit"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;

  const page = document.createElement("div");
  page.id = "ms-page";
  page.innerHTML = `
    <div id="ms-page-head">
      <button id="ms-page-back"><i class="fa-solid fa-arrow-left"></i> Back to site</button>
      <span id="ms-page-title">Generated view</span>
      <i class="fa-solid fa-wand-magic-sparkles ms-page-icon"></i>
    </div>
    <div id="ms-page-body"><div id="ms-page-content"></div></div>
  `;

  document.body.appendChild(page);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector("#ms-log");
  const form = panel.querySelector("#ms-form");
  const input = panel.querySelector("#ms-input");

  // Strips scripts/handlers from AI-generated HTML before it's injected into our
  // own DOM (we're not using a sandboxed iframe here, so this is defense-in-depth
  // against the model ever including something it was told not to).
  function sanitizeHtml(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "")
      // wrap the brand logo (the only <img> the AI is allowed to include) in a
      // light box, so a dark logo still shows up against our dark theme
      .replace(/<img\b([^>]*)>/gi, '<span class="ms-logo-box"><img$1></span>');
  }

  // Shows the AI-generated view as a full-viewport panel styled to match this
  // site's theme, layered *below* the chat button/panel (z-index) so the chat
  // stays visible and usable the whole time — nothing navigates away.
  function openGeneratedPage(html, title) {
    page.querySelector("#ms-page-title").textContent = title || "Generated view";
    page.querySelector("#ms-page-content").innerHTML = sanitizeHtml(html);
    page.querySelector("#ms-page-body").scrollTop = 0;
    page.classList.add("open");
  }
  page.querySelector("#ms-page-back").addEventListener("click", () => page.classList.remove("open"));

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

  function extractPage(text) {
    // pulls out the <<<MAGICSCRIPT_PAGE ...> ... <<<END_MAGICSCRIPT_PAGE>>> block, if the AI generated one
    // (opening tag closes with a single ">", closing tag with ">>>" — see the system prompt)
    const m = text.match(/<<<MAGICSCRIPT_PAGE(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<<<END_MAGICSCRIPT_PAGE>>>/);
    if (!m) return { chat: text, page: null, title: null };
    const chat = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, " ").trim();
    return { chat, page: m[2].trim(), title: m[1] || "Generated view" };
  }

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

  // The AI key lives server-side (Netlify function) — the browser never sees it.
  async function askServer() {
    const typing = showTyping();
    try {
      const contents = history.slice(-20).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.text }],
      }));
      while (contents.length && contents[0].role !== "user") contents.shift();

      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents }),
      });
      const data = await res.json();
      typing.remove();

      if (res.status === 502) {
        // the AI backend itself failed (e.g. Gemini briefly overloaded) — say so honestly
        // rather than silently substituting an unrelated canned reply
        return push("bot", "⚠️ My AI brain is briefly overloaded — please ask that again in a few seconds.");
      }
      if (!res.ok) {
        // endpoint missing entirely (e.g. running the file locally without Netlify) — degrade gracefully
        return answer(history[history.length - 1].text);
      }
      const { chat, page: pageHtml, title } = extractPage(data.text);
      const chatText = runActions(chat); // also executes any [[setLanguage:xx]] token as a side effect
      if (pageHtml) {
        // the page carries the actual content — keep the chat bubble short regardless
        // of how long a preamble the model wrote before the <<<MAGICSCRIPT_PAGE>>> block
        push("bot", "Here's your view! ✨");
        openGeneratedPage(pageHtml, title);
      } else {
        push("bot", chatText || "Sorry, I couldn't answer that one.");
      }
    } catch (err) {
      typing.remove();
      answer(history[history.length - 1].text);
    }
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
        "• Remember our previous chats"
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
      return reply("I can generate a chart or report as a new page — but my AI brain seems briefly unavailable. Try again in a moment!");
    }
    if (/price|cost|free/.test(t)) {
      return reply("This is a demo — pricing is up to your imagination. 😄");
    }
    if (/\b(hi|hello|hola|hey|bonjour|hallo|ciao|olá|привет|你好|こんにちは|안녕|مرحبا|merhaba|cześć)\b/.test(t)) {
      return reply("Hey! 👋 Ask me what I can do.");
    }
    reply('Not sure about that one. Try "what can you do?" or "switch to French".');
  }

  function openPanel() {
    panel.classList.remove("closing");
    panel.classList.add("open");
    if (!log.hasChildNodes()) {
      history.forEach(render);
      if (!history.length) push("bot", "Hi! I'm MagicScript — the assistant living on this site. Ask me what I can do. ✨");
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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    push("user", q);
    askServer();
  });
})();
