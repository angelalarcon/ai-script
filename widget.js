/* MagicScript — drop-in AI chat widget (demo build).
   Host pages can expose actions via window.MagicScriptActions = { actionName: fn }.
   Styling is Tailwind utility classes only (loaded via CDN below) — no hand-written CSS. */
(function () {
  const STORAGE_KEY = "magicscript-history";
  const CHAT_ENDPOINT = "/api/chat";
  const POP = "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none";

  // Load Tailwind (with the typography plugin, for styling AI-generated markup via
  // `prose`) unless the host page already has its own — avoids running two JIT
  // instances at once. Load Font Awesome too, since the widget's icons need it.
  if (!window.tailwind && !document.querySelector('script[src*="cdn.tailwindcss.com"]')) {
    const tw = document.createElement("script");
    tw.src = "https://cdn.tailwindcss.com?plugins=typography";
    document.head.appendChild(tw);
  }
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const fa = document.createElement("link");
    fa.rel = "stylesheet";
    fa.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
    document.head.appendChild(fa);
  }

  const btn = document.createElement("button");
  btn.id = "ms-btn";
  btn.title = "Chat with MagicScript";
  btn.className =
    "fixed bottom-6 right-6 w-14 h-14 rounded-full bg-indigo-600 text-white border-none " +
    "cursor-pointer shadow-[0_10px_25px_rgba(79,70,229,0.45)] z-[9999] flex items-center justify-center " +
    "transition-transform duration-150 hover:scale-110 motion-reduce:transition-none";
  btn.innerHTML = '<img src="logo.svg" alt="MagicScript" class="invert w-[34px] h-[34px] block">';

  const panel = document.createElement("div");
  panel.id = "ms-panel";
  panel.className =
    "fixed bottom-[94px] right-6 w-[340px] max-w-[calc(100vw-2rem)] h-[440px] bg-white rounded-2xl " +
    "shadow-[0_20px_50px_rgba(0,0,0,0.25)] overflow-hidden z-[9999] font-sans flex-col origin-bottom-right " +
    `${POP} hidden opacity-0 scale-95 translate-y-8`;
  panel.innerHTML = `
    <div id="ms-head" class="bg-indigo-600 text-white px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span class="font-semibold flex-1 text-sm">MagicScript</span>
      <button id="ms-clear" title="Clear history" class="bg-transparent border-none text-indigo-200 cursor-pointer text-sm hover:text-white"><i class="fa-solid fa-trash"></i></button>
      <button id="ms-close" title="Close" class="bg-transparent border-none text-indigo-200 cursor-pointer text-sm hover:text-white"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div id="ms-log" class="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2 bg-slate-50"></div>
    <form id="ms-form" class="flex gap-2 p-2.5 border-t border-slate-200 bg-white flex-shrink-0">
      <input id="ms-input" autocomplete="off" placeholder="Ask me anything…"
        class="flex-1 border border-slate-300 rounded-full px-3.5 py-2 text-sm outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600">
      <button id="ms-send" type="submit" class="bg-indigo-600 text-white border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-indigo-700"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;

  const page = document.createElement("div");
  page.id = "ms-page";
  page.className =
    `fixed inset-0 bg-[#020617] text-slate-200 z-[9990] font-sans flex-col ${POP} ` +
    "hidden opacity-0 translate-y-2";
  page.innerHTML = `
    <div id="ms-page-head" class="flex items-center gap-3 px-6 py-4 border-b border-slate-800 flex-shrink-0">
      <button id="ms-page-back" class="inline-flex items-center gap-1.5 bg-indigo-600/15 text-indigo-300 border-none rounded-full px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-indigo-600/30 hover:text-white">
        <i class="fa-solid fa-arrow-left"></i> Back to site
      </button>
      <span id="ms-page-title" class="text-[15px] font-semibold text-slate-100 flex-1 truncate">Generated view</span>
      <i class="fa-solid fa-wand-magic-sparkles text-indigo-400"></i>
    </div>
    <div id="ms-page-body" class="flex-1 overflow-y-auto px-6 py-9">
      <div id="ms-page-content"
        class="prose prose-invert max-w-[680px] mx-auto prose-headings:text-slate-100
          prose-h1:text-4xl prose-h1:font-extrabold prose-h2:text-2xl prose-h2:font-bold
          prose-p:text-slate-400 prose-li:text-slate-300 prose-strong:text-slate-100"></div>
    </div>
  `;

  document.body.appendChild(page);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector("#ms-log");
  const form = panel.querySelector("#ms-form");
  const input = panel.querySelector("#ms-input");

  // Strips scripts/handlers from AI-generated HTML before it's injected into our own
  // DOM (no sandboxed iframe here, so this is defense-in-depth), and re-wraps the one
  // allowed <img> (the fetched brand logo) in a light box with our own Tailwind sizing
  // classes — a dark logo needs contrast, and this way it's guaranteed regardless of
  // whatever attributes the model put on the tag.
  function sanitizeHtml(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/ on[a-z]+\s*=\s*"[^"]*"/gi, "")
      .replace(/ on[a-z]+\s*=\s*'[^']*'/gi, "")
      .replace(/javascript:/gi, "")
      .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
        const clean = attrs.replace(/\s*style="[^"]*"/gi, "").replace(/\s*class="[^"]*"/gi, "");
        return `<span class="inline-block bg-white p-2 rounded-xl shadow-md mb-4 not-prose"><img${clean} class="block max-h-10 max-w-[160px] object-contain rounded"></span>`;
      });
  }

  // Shows the AI-generated view as a full-viewport panel styled to match this site's
  // theme, layered *below* the chat button/panel (z-index) so the chat stays visible
  // and usable the whole time — nothing navigates away.
  function openGeneratedPage(html, title) {
    page.querySelector("#ms-page-title").textContent = title || "Generated view";
    page.querySelector("#ms-page-content").innerHTML = sanitizeHtml(html);
    page.querySelector("#ms-page-body").scrollTop = 0;
    page.classList.remove("hidden");
    page.classList.add("flex");
    requestAnimationFrame(() => {
      page.classList.remove("opacity-0", "translate-y-2");
      page.classList.add("opacity-100", "translate-y-0");
    });
  }
  function closeGeneratedPage() {
    page.classList.remove("opacity-100", "translate-y-0");
    page.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => { page.classList.remove("flex"); page.classList.add("hidden"); }, 300);
  }
  page.querySelector("#ms-page-back").addEventListener("click", closeGeneratedPage);

  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) {}

  function render(msg, delayMs) {
    const div = document.createElement("div");
    const roleClasses = msg.role === "user"
      ? "self-end bg-indigo-600 text-white rounded-br-sm"
      : "self-start bg-slate-200 text-slate-900 rounded-bl-sm";
    div.className =
      `max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${POP} ` +
      `${roleClasses} opacity-0 translate-y-3 scale-90`;
    if (delayMs) div.classList.add(`delay-[${delayMs}ms]`);
    div.textContent = msg.text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    requestAnimationFrame(() => {
      div.classList.remove("opacity-0", "translate-y-3", "scale-90");
      div.classList.add("opacity-100", "translate-y-0", "scale-100");
    });
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
    const div = document.createElement("div");
    div.className =
      "max-w-[85%] self-start bg-slate-200 text-slate-900 rounded-2xl rounded-bl-sm px-3 py-2 text-sm tracking-widest animate-pulse";
    div.textContent = "•••";
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
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
    panel.classList.remove("hidden");
    panel.classList.add("flex");
    if (!log.hasChildNodes()) {
      // stagger each historical message's entrance; live messages (via push) pop in immediately
      history.forEach((msg, i) => render(msg, Math.min(160 + i * 60, 560)));
      if (!history.length) push("bot", "Hi! I'm MagicScript — the assistant living on this site. Ask me what I can do. ✨");
    }
    requestAnimationFrame(() => {
      panel.classList.remove("opacity-0", "scale-95", "translate-y-8");
      panel.classList.add("opacity-100", "scale-100", "translate-y-0");
    });
    input.focus();
  }

  function closePanel() {
    panel.classList.remove("opacity-100", "scale-100", "translate-y-0");
    panel.classList.add("opacity-0", "scale-95", "translate-y-8");
    setTimeout(() => { panel.classList.remove("flex"); panel.classList.add("hidden"); }, 300);
  }

  btn.addEventListener("click", () => {
    panel.classList.contains("hidden") ? openPanel() : closePanel();
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
