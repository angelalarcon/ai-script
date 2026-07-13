/* MagicScript — drop-in AI chat widget (demo build).
   Host pages can expose actions via window.MagicScriptActions = { actionName: fn }.
   Styling is Tailwind utility classes only (loaded via CDN below) — no hand-written CSS. */
(function () {
  const STORAGE_KEY = "magicscript-history";
  const CHAT_ENDPOINT = "/api/chat";
  const POP = "transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Real, verified LottieFiles assets (fetched and confirmed live):
  const LOTTIE_ASSISTANT = "https://assets-v2.lottiefiles.com/a/f0e4e78a-117f-11ee-a561-9f6d0ded2937/u3HyS9kfe7.lottie";
  const LOTTIE_TYPING = "https://assets-v2.lottiefiles.com/a/b68f0260-1188-11ee-adaf-6fe510d5f86b/X65jJBNW1W.lottie";

  // Placeholder headshots standing in for "identified leads/prospects" — used only
  // by the lead-identification gallery (see startLeadGallery below).
  const LEAD_AVATARS = Array.from({ length: 14 }, (_, i) => `https://i.pravatar.cc/200?img=${i + 10}`);
  let leadGalleryTimer = null;

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
  // The dotLottie web component — renders the .lottie animations above via <dotlottie-wc>.
  if (!document.querySelector('script[src*="dotlottie-wc"]')) {
    const dl = document.createElement("script");
    dl.type = "module";
    dl.src = "https://unpkg.com/@lottiefiles/dotlottie-wc@latest/dist/dotlottie-wc.js";
    document.head.appendChild(dl);
  }

  // A pulsing ring behind the launcher invites the first click — removed for good
  // once the user has opened the chat, so it doesn't nag afterward.
  const pingRing = document.createElement("span");
  pingRing.setAttribute("aria-hidden", "true");
  pingRing.className =
    "fixed bottom-6 right-6 w-14 h-14 rounded-full bg-indigo-400 opacity-40 " +
    "animate-ping pointer-events-none z-[9998] motion-reduce:hidden";

  const btn = document.createElement("button");
  btn.id = "ms-btn";
  btn.title = "Chat with MagicScript";
  btn.className =
    "fixed bottom-6 right-6 w-14 h-14 rounded-full bg-indigo-600 text-white border-none " +
    "cursor-pointer shadow-[0_10px_25px_rgba(79,70,229,0.45)] z-[9999] flex items-center justify-center " +
    "transition-transform duration-150 hover:scale-110 active:scale-90 motion-reduce:transition-none";
  btn.innerHTML = '<img src="logo.svg" alt="MagicScript" class="invert w-[34px] h-[34px] block">';

  const panel = document.createElement("div");
  panel.id = "ms-panel";
  panel.className =
    "fixed bottom-[94px] right-6 w-[340px] max-w-[calc(100vw-2rem)] h-[440px] bg-white rounded-2xl " +
    "shadow-[0_20px_50px_rgba(0,0,0,0.25)] overflow-hidden z-[9999] font-sans flex-col origin-bottom-right " +
    `${POP} hidden opacity-0 scale-95 translate-y-8`;
  const HEAD_BTN =
    "bg-transparent border-none text-indigo-200 cursor-pointer text-sm hover:text-white " +
    "transition-transform duration-150 active:scale-75 motion-reduce:transition-none";
  panel.innerHTML = `
    <div id="ms-head" class="bg-indigo-600 text-white px-4 py-3 flex items-center gap-2.5 flex-shrink-0">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      <span class="font-semibold flex-1 text-sm truncate">MagicScript</span>
      <button id="ms-new" title="New chat" class="${HEAD_BTN}"><i class="fa-solid fa-pen-to-square"></i></button>
      <button id="ms-history-btn" title="Previous conversations" class="${HEAD_BTN}"><i class="fa-solid fa-clock-rotate-left"></i></button>
      <button id="ms-clear" title="Delete all conversations" class="${HEAD_BTN}"><i class="fa-solid fa-trash"></i></button>
      <button id="ms-close" title="Close" class="${HEAD_BTN}"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="relative flex-1 overflow-hidden">
      <div id="ms-log" class="absolute inset-0 overflow-y-auto p-3.5 flex flex-col gap-2 bg-slate-50"></div>
      <div id="ms-history" class="absolute inset-0 bg-white flex-col hidden">
        <div class="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-200 flex-shrink-0">
          <button id="ms-history-back" class="bg-transparent border-none text-slate-500 cursor-pointer text-sm hover:text-slate-800 transition-transform duration-150 active:scale-75 motion-reduce:transition-none"><i class="fa-solid fa-arrow-left"></i></button>
          <span class="text-sm font-semibold text-slate-700 flex-1">Previous conversations</span>
        </div>
        <div id="ms-history-list" class="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5"></div>
      </div>
    </div>
    <form id="ms-form" class="flex gap-2 p-2.5 border-t border-slate-200 bg-white flex-shrink-0">
      <input id="ms-input" autocomplete="off" placeholder="Ask me anything…"
        class="flex-1 border border-slate-300 rounded-full px-3.5 py-2 text-sm outline-none bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-600">
      <button id="ms-send" type="submit" class="bg-indigo-600 text-white border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer hover:bg-indigo-700 transition-transform duration-150 active:scale-75 motion-reduce:transition-none"><i class="fa-solid fa-paper-plane"></i></button>
    </form>
  `;

  const page = document.createElement("div");
  page.id = "ms-page";
  page.className =
    `fixed inset-0 bg-[#020617] text-slate-200 z-[9990] font-sans flex-col ${POP} ` +
    "hidden opacity-0 translate-y-2";
  page.innerHTML = `
    <div id="ms-page-head" class="flex items-center gap-3 px-6 py-4 border-b border-slate-800 flex-shrink-0">
      <button id="ms-page-back" class="inline-flex items-center gap-1.5 bg-indigo-600/15 text-indigo-300 border-none rounded-full px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-indigo-600/30 hover:text-white transition-transform duration-150 active:scale-90 motion-reduce:transition-none">
        <i class="fa-solid fa-arrow-left"></i> Back to site
      </button>
      <span id="ms-page-title" class="text-[15px] font-semibold text-slate-100 flex-1 truncate">Generated view</span>
    </div>
    <div id="ms-page-body" class="flex-1 overflow-y-auto px-6 py-9">
      <div id="ms-page-content"
        class="prose prose-invert max-w-[680px] mx-auto prose-headings:text-slate-100
          prose-h1:text-4xl prose-h1:font-extrabold prose-h2:text-3xl prose-h2:font-bold
          prose-p:text-slate-400 prose-li:text-slate-300 prose-strong:text-slate-100"></div>
    </div>
  `;

  document.body.appendChild(page);
  document.body.appendChild(pingRing);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const log = panel.querySelector("#ms-log");
  const form = panel.querySelector("#ms-form");
  const input = panel.querySelector("#ms-input");

  // The model is told to use Tailwind classes only, but LLMs habitually reach for
  // inline style="" anyway — prompting alone isn't reliable, so this mechanically
  // converts every inline style declaration it writes into an equivalent Tailwind
  // arbitrary-value utility class, guaranteeing zero inline CSS reaches the page
  // regardless of what the model actually produced.
  function styleToTailwindClasses(styleStr) {
    const SKIP = new Set(["font-family", "box-shadow", "text-decoration", "overflow"]);
    const ENUM = {
      display: { flex: "flex", block: "block", none: "hidden", "inline-block": "inline-block", grid: "grid" },
      "align-items": { center: "items-center", "flex-start": "items-start", "flex-end": "items-end", baseline: "items-baseline" },
      "justify-content": { center: "justify-center", "space-between": "justify-between", "flex-start": "justify-start", "flex-end": "justify-end" },
      "text-align": { center: "text-center", left: "text-left", right: "text-right", end: "text-right", start: "text-left" },
      "white-space": { nowrap: "whitespace-nowrap", "pre-wrap": "whitespace-pre-wrap", normal: "whitespace-normal" },
      "list-style": { none: "list-none" },
      "list-style-type": { none: "list-none" },
      "object-fit": { contain: "object-contain", cover: "object-cover" },
    };
    const PREFIX = {
      color: "text", background: "bg", "background-color": "bg",
      "border-radius": "rounded", "border-color": "border",
      padding: "p", "padding-top": "pt", "padding-right": "pr", "padding-bottom": "pb", "padding-left": "pl",
      margin: "m", "margin-top": "mt", "margin-right": "mr", "margin-bottom": "mb", "margin-left": "ml",
      "font-size": "text", "font-weight": "font", "line-height": "leading", "letter-spacing": "tracking",
      "max-width": "max-w", "min-width": "min-w", width: "w", height: "h",
      gap: "gap", opacity: "opacity",
    };
    const classes = [];
    String(styleStr).split(";").forEach((decl) => {
      const idx = decl.indexOf(":");
      if (idx < 0) return;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!prop || !value || SKIP.has(prop)) return;
      if (prop === "margin" && /^0\s+auto$/.test(value)) { classes.push("mx-auto"); return; }
      if (prop === "border") {
        const m = value.match(/solid\s+(.+)$/i);
        classes.push("border");
        if (m) classes.push(`border-[${m[1].replace(/\s+/g, "")}]`);
        return;
      }
      if (ENUM[prop] && ENUM[prop][value]) { classes.push(ENUM[prop][value]); return; }
      if (PREFIX[prop]) classes.push(`${PREFIX[prop]}-[${value.replace(/\s+/g, "_")}]`);
    });
    return classes;
  }

  function sanitizeHtml(html) {
    const container = document.createElement("div");
    container.innerHTML = String(html);

    container.querySelectorAll("script, iframe").forEach((el) => el.remove());

    container.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((attr) => {
        if (/^on/i.test(attr.name) || /javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
      });
    });

    // convert every inline style="" into equivalent Tailwind utility classes, then drop it
    container.querySelectorAll("[style]").forEach((el) => {
      el.classList.add(...styleToTailwindClasses(el.getAttribute("style")));
      el.removeAttribute("style");
    });

    // box the one allowed <img> (brand logo) for contrast against our dark theme,
    // ignoring whatever sizing/class the model put on it
    container.querySelectorAll("img").forEach((img) => {
      img.removeAttribute("style");
      img.className = "block max-h-16 max-w-[220px] object-contain rounded-lg";
      const wrap = document.createElement("span");
      wrap.className = "inline-block bg-white p-3 rounded-2xl shadow-md mb-4 not-prose";
      img.replaceWith(wrap);
      wrap.appendChild(img);
    });

    // the static Font Awesome icons the model sprinkles through the text read too
    // small at prose size — bump them so they register as visual anchors
    container.querySelectorAll("i[class*='fa-']").forEach((icon) => {
      icon.classList.add("text-2xl", "align-middle");
    });

    // a benefit list item's leading icon: the model's own gap-3/items-start
    // (from the pattern below) reads too tight once the icon is enlarged above,
    // and compliance with even that varies — enforced directly on every such
    // <li> instead, replacing whatever spacing/alignment classes it wrote
    container.querySelectorAll("li > i[class*='fa-']:first-child").forEach((icon) => {
      const li = icon.parentElement;
      li.classList.remove(...[...li.classList].filter((c) => /^(gap|items)-/.test(c)));
      li.classList.add("flex", "items-start", "gap-4");
    });

    // h2 titles are frequently inside a not-prose card (per our own example
    // pattern below), which opts that whole subtree OUT of the typography
    // plugin's prose-h2 sizing — so set the size directly on every h2 instead
    // of relying on prose scoping that half the time doesn't apply
    container.querySelectorAll("h2").forEach((h) => {
      h.classList.add("text-3xl", "font-bold", "text-slate-100");
    });

    // a section heading's leading icon gets a faux-duotone treatment (a faded,
    // slightly larger copy of the same glyph behind the solid one) — real fa-duotone
    // is Font Awesome Pro only and unavailable on the free CDN kit this loads.
    // The heading itself becomes a flex row (icon | title) with real gap-4
    // spacing between them, and the title's own text is pulled into its own
    // flex item — so on a wrapping title the second line stays in the text's
    // column instead of flowing back underneath the icon.
    container.querySelectorAll("h2 > i[class*='fa-']:first-child").forEach((icon) => {
      const glyph = [...icon.classList].find((c) => /^fa-(?!solid$|regular$|brands$)/.test(c));
      if (!glyph) return;
      const h2 = icon.parentElement;
      const wrap = document.createElement("span");
      wrap.className = "relative inline-block w-8 h-8 flex-shrink-0 not-prose";
      wrap.innerHTML =
        `<i class="fa-solid ${glyph} absolute inset-0 flex items-center justify-center text-3xl scale-125 text-indigo-400/30"></i>` +
        `<i class="fa-solid ${glyph} absolute inset-0 flex items-center justify-center text-3xl text-indigo-400"></i>`;
      const titleWrap = document.createElement("span");
      while (icon.nextSibling) titleWrap.appendChild(icon.nextSibling);
      icon.replaceWith(wrap);
      h2.appendChild(titleWrap);
      h2.classList.add("flex", "items-start", "gap-4");
    });

    // give every chart breathing room from whatever text precedes it — the model
    // reliably forgets top margin, which crowds a tall bar's value label into the
    // heading above it. overflow-hidden is a safety net: SVG <text> never wraps,
    // so any stray long label the model adds gets clipped to the chart's own box
    // instead of bleeding across the rest of the page.
    container.querySelectorAll("svg").forEach((svg) => {
      svg.classList.add("block", "mt-6", "overflow-hidden");
      // establishes the containing block for the sentiment face icons
      // (see placeSentimentIcons) that get absolutely positioned over it later
      if (svg.parentElement) svg.parentElement.classList.add("relative");
    });

    // a chart title is HTML outside the <svg> per the prompt, but the model
    // occasionally adds one more <text> inside anyway (e.g. a subtitle) beyond
    // the baseline/bars/labels it was told to draw — svg text never wraps, so a
    // long one runs straight off the right edge instead of clipping cleanly.
    // Structurally a stray title is indistinguishable from a legit category
    // label (both are plain <text>, direct children of <svg>), so length is the
    // signal: real category labels ("Before", "Q1 2024") are short; a title-length
    // string this deep is almost certainly the stray we're guarding against.
    container.querySelectorAll("svg text:not([data-bar-value])").forEach((t) => {
      if (t.closest("g[data-bar-group]")) return;
      if ((t.textContent || "").trim().length > 20) t.remove();
    });

    // a value label sits above its bar on the dark page background, never on
    // top of the bar itself, so it must always stay bright — but the model
    // sometimes matches its fill to the bar's own color instead of the
    // prescribed bright one, which reads as barely-visible gray-on-dark
    container.querySelectorAll("[data-bar-value]").forEach((label) => {
      label.classList.remove(...[...label.classList].filter((c) => c.startsWith("fill-")));
      label.classList.add("fill-slate-100");
    });

    // freeze every bar at zero height/baseline so it can grow in on scroll (see
    // startBarObserver, wired up once this markup is live in the DOM). Each bar's
    // rx rounds all four corners, which looks wrong once it settles at the
    // baseline — a same-color sibling rect masks just the bottom strip square.
    // The value label stays hidden until the bar finishes growing. All skipped
    // under reduced motion, so bars and labels just render at full size/visible.
    if (!reduceMotion) {
      container.querySelectorAll("g[data-bar-group] rect[data-bar]").forEach((rect) => {
        const x = rect.getAttribute("x");
        const width = rect.getAttribute("width");
        const h = parseFloat(rect.getAttribute("height")) || 0;
        const y = parseFloat(rect.getAttribute("y")) || 0;
        const r = Math.min(parseFloat(rect.getAttribute("rx")) || 8, h);
        const fillClass = [...rect.classList].find((c) => c.startsWith("fill-"));

        rect.dataset.targetHeight = h;
        rect.dataset.targetY = y;
        rect.setAttribute("height", "0");
        rect.setAttribute("y", String(y + h));
        rect.classList.add("transition-all", "duration-700", "ease-[cubic-bezier(0.34,1.56,0.64,1)]");

        const mask = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        mask.setAttribute("data-bar-mask", "");
        mask.setAttribute("x", x);
        mask.setAttribute("width", width);
        mask.setAttribute("height", "0");
        mask.setAttribute("y", String(y + h));
        if (fillClass) mask.classList.add(fillClass);
        mask.classList.add("transition-all", "duration-700", "ease-[cubic-bezier(0.34,1.56,0.64,1)]");
        mask.dataset.targetHeight = r;
        mask.dataset.targetY = y + h - r;
        rect.insertAdjacentElement("afterend", mask);
      });

      container.querySelectorAll("[data-bar-value]").forEach((label) => {
        label.classList.add("opacity-0", "transition-opacity", "duration-300");
      });
    }

    // the model marks a lead-identification gallery mount point with this empty
    // marker div (see SYSTEM_PROMPT) — style its container here, then
    // startLeadGallery (wired up once live in the DOM) does the actual animation
    container.querySelectorAll("[data-lead-gallery]").forEach((el) => {
      el.innerHTML = "";
      el.className = reduceMotion
        ? "not-prose grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6"
        : "not-prose relative w-full h-64 md:h-72 overflow-hidden mb-6";
    });

    return container.innerHTML;
  }

  // fa-face-thinking / fa-face-relieved and the Light/Thin/Sharp styles the model
  // was once asked for don't exist at all on the free Font Awesome CDN kit this
  // loads (verified against its actual served CSS) — Regular is the free style
  // that reads lightest/thinnest, so these keep the same glyphs already
  // confirmed to render (fa-face-frown / fa-face-smile-beam) in that weight.
  const SENTIMENT_GLYPH = {
    down: "fa-regular fa-face-frown",
    up: "fa-regular fa-face-smile-beam",
  };
  // The icon's own color can't be fixed per sentiment direction — the model is
  // free to put either fill class on either bar, so an "up" bar is sometimes
  // the pale fill-slate-300 one, not the dark indigo one, and a fixed light
  // color read as barely-visible on it. Contrast has to follow the bar's
  // actual fill, whichever bar ends up with it.
  const FILL_CONTRAST_ICON = {
    "fill-indigo-500": "text-white",
    "fill-slate-300": "text-slate-800",
    "fill-slate-400": "text-slate-900",
  };

  // Places a face icon INSIDE a bar's own rendered rectangle, computed from real
  // pixel geometry (the svg's viewBox-to-screen scale) rather than approximated
  // with CSS alongside it — the two bars in a before/after chart are rarely the
  // same height, so no fixed layout could land "inside" both at once reliably.
  // Uses each bar's stored *target* geometry, not its live (possibly still
  // mid-grow-in) attributes, so the icon's position is correct immediately
  // regardless of animation state.
  function placeSentimentIcon(group) {
    const sentiment = group.getAttribute("data-sentiment");
    const glyph = SENTIMENT_GLYPH[sentiment];
    const rect = group.querySelector("rect[data-bar]");
    const svg = group.ownerSVGElement;
    if (!glyph || !rect || !svg) return null;
    const fillClass = [...rect.classList].find((c) => c.startsWith("fill-"));
    const color = FILL_CONTRAST_ICON[fillClass] || "text-slate-800";
    const container = svg.parentElement;
    const svgBox = svg.getBoundingClientRect();
    const containerBox = container.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height) return null;
    const scaleX = svgBox.width / vb.width;
    const scaleY = svgBox.height / vb.height;
    const barX = parseFloat(rect.getAttribute("x")) || 0;
    const barW = parseFloat(rect.getAttribute("width")) || 0;
    const targetY = parseFloat(rect.dataset.targetY ?? rect.getAttribute("y")) || 0;
    const centerXsvg = barX + barW / 2;
    const left = Math.round((svgBox.left - containerBox.left) + (centerXsvg - vb.x) * scaleX);
    const top = Math.round((svgBox.top - containerBox.top) + (targetY - vb.y) * scaleY + 14);

    const icon = document.createElement("i");
    icon.className =
      `${glyph} ${color} absolute [left:${left}px] [top:${top}px] -translate-x-1/2 ` +
      "text-2xl opacity-0 transition-opacity duration-300 not-prose";
    container.appendChild(icon);
    return icon;
  }

  // Creates every sentiment icon up front (geometry only depends on each bar's
  // final target position, not its current animated state) but leaves it at
  // opacity-0 — startBarObserver reveals it in step with that specific bar
  // finishing its grow-in, or immediately here under reduced motion.
  function placeSentimentIcons(content) {
    content.querySelectorAll("g[data-bar-group][data-sentiment]").forEach((group) => {
      const icon = placeSentimentIcon(group);
      if (!icon) return;
      group.sentimentIconEl = icon;
      if (reduceMotion) icon.classList.remove("opacity-0");
    });
  }

  // Grows each bar chart's group (frozen at zero height by sanitizeHtml) to its
  // real size once it scrolls into view — a one-shot grow-in, not a loop — then
  // reveals that bar's value label once the grow transition actually finishes.
  function startBarObserver(content) {
    if (reduceMotion) return; // sanitizeHtml left bars/labels at full size — nothing to animate
    const groups = content.querySelectorAll("g[data-bar-group]");
    if (!groups.length || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const rect = entry.target.querySelector("rect[data-bar]");
        const mask = entry.target.querySelector("rect[data-bar-mask]");
        const label = entry.target.querySelector("[data-bar-value]");
        if (rect) {
          rect.setAttribute("height", rect.dataset.targetHeight);
          rect.setAttribute("y", rect.dataset.targetY);
          rect.addEventListener("transitionend", () => {
            if (label) { label.classList.remove("opacity-0"); label.classList.add("opacity-100"); }
            if (entry.target.sentimentIconEl) entry.target.sentimentIconEl.classList.remove("opacity-0");
          }, { once: true });
        }
        if (mask) {
          mask.setAttribute("height", mask.dataset.targetHeight);
          mask.setAttribute("y", mask.dataset.targetY);
        }
      });
    }, { threshold: 0.4, root: page.querySelector("#ms-page-body") });
    groups.forEach((g) => io.observe(g));
  }

  function pickUniqueAvatar(recent) {
    let pool = LEAD_AVATARS.filter((u) => !recent.includes(u));
    if (!pool.length) { recent.length = 0; pool = LEAD_AVATARS; }
    const src = pool[Math.floor(Math.random() * pool.length)];
    recent.push(src);
    if (recent.length > 5) recent.shift();
    return src;
  }

  // One floating headshot: fades/scales in at a random spot in the container,
  // holds briefly, fades/scales out, then removes itself — modeled on OriginKit's
  // "Image Gallery" crowd effect (https://www.originkit.dev/components/imagegallery).
  function spawnLeadTile(container, recent) {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 260;
    const size = Math.round(60 + Math.random() * 50);
    const x = Math.round(Math.random() * Math.max(0, w - size));
    const y = Math.round(Math.random() * Math.max(0, h - size));
    const src = pickUniqueAvatar(recent);

    const tile = document.createElement("div");
    tile.className =
      `absolute [left:${x}px] [top:${y}px] [width:${size}px] [height:${size}px] rounded-xl overflow-hidden shadow-lg ` +
      "opacity-0 scale-75 transition-all duration-700 ease-out";
    tile.innerHTML = `<img src="${src}" alt="" class="w-full h-full object-cover">`;
    container.appendChild(tile);
    requestAnimationFrame(() => {
      tile.classList.remove("opacity-0", "scale-75");
      tile.classList.add("opacity-100", "scale-100");
    });
    setTimeout(() => {
      tile.classList.remove("duration-700", "ease-out", "opacity-100", "scale-100");
      tile.classList.add("duration-500", "ease-in", "opacity-0", "scale-90");
      setTimeout(() => tile.remove(), 520);
    }, 1300 + Math.random() * 700);
  }

  function stopLeadGallery() {
    if (leadGalleryTimer) { clearInterval(leadGalleryTimer); leadGalleryTimer = null; }
  }

  function startLeadGallery(el) {
    if (reduceMotion) {
      LEAD_AVATARS.slice(0, 6).forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        img.className = "w-full h-20 object-cover rounded-lg";
        el.appendChild(img);
      });
      return;
    }
    const recent = [];
    leadGalleryTimer = setInterval(() => {
      if (el.isConnected && el.children.length < 6) spawnLeadTile(el, recent);
    }, 450);
  }

  // Reveals matched children one after another (fade + rise + scale, staggered by
  // Tailwind's own delay-[Nms] utility — never inline style) — used to animate in
  // each title/icon/callout of a freshly-opened generated page.
  function staggerReveal(container, selector, step, max) {
    const els = [...container.querySelectorAll(selector)];
    els.forEach((el, i) => {
      el.classList.add(
        "transition-all", "duration-500", "ease-[cubic-bezier(0.34,1.56,0.64,1)]", "motion-reduce:transition-none",
        "opacity-0", "translate-y-3", `delay-[${Math.min(i * step, max)}ms]`
      );
    });
    requestAnimationFrame(() => {
      els.forEach((el) => {
        el.classList.remove("opacity-0", "translate-y-3");
        el.classList.add("opacity-100", "translate-y-0");
      });
    });
  }

  // Shows the AI-generated view as a full-viewport panel styled to match this site's
  // theme, layered *below* the chat button/panel (z-index) so the chat stays visible
  // and usable the whole time — nothing navigates away.
  function openGeneratedPage(html, title) {
    stopLeadGallery();
    // the overlay covers the whole viewport, but the host page underneath was
    // still scrollable — its scrollbar sat right next to the overlay's own,
    // showing two at once. Lock it while the overlay's open, same as any modal.
    document.documentElement.classList.add("overflow-hidden");
    document.body.classList.add("overflow-hidden");
    page.querySelector("#ms-page-title").textContent = title || "Generated view";
    const content = page.querySelector("#ms-page-content");
    content.innerHTML = sanitizeHtml(html);
    page.querySelector("#ms-page-body").scrollTop = 0;
    page.classList.remove("hidden");
    page.classList.add("flex");
    requestAnimationFrame(() => {
      page.classList.remove("opacity-0", "translate-y-2");
      page.classList.add("opacity-100", "translate-y-0");
    });
    staggerReveal(content, "h1, h2, h3, .not-prose, li", 70, 560);
    startBarObserver(content);
    placeSentimentIcons(content);
    const gallery = content.querySelector("[data-lead-gallery]");
    if (gallery) startLeadGallery(gallery);
  }
  function closeGeneratedPage() {
    stopLeadGallery();
    document.documentElement.classList.remove("overflow-hidden");
    document.body.classList.remove("overflow-hidden");
    page.classList.remove("opacity-100", "translate-y-0");
    page.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => { page.classList.remove("flex"); page.classList.add("hidden"); }, 300);
  }
  page.querySelector("#ms-page-back").addEventListener("click", closeGeneratedPage);

  const CONV_KEY = "magicscript-conversations";
  const ACTIVE_KEY = "magicscript-active-id";

  function genId() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function deriveTitle(messages) {
    const firstUser = messages.find((m) => m.role === "user");
    const text = (firstUser && firstUser.text) || "New chat";
    return text.length > 40 ? text.slice(0, 40) + "…" : text;
  }

  function timeAgo(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  // One conversation per "New chat" click: {id, title, messages, updatedAt}. The
  // old single-thread format (a flat message array under one key) migrates into
  // this on first load rather than losing a returning visitor's history.
  function loadConversations() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONV_KEY));
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(legacy) && legacy.length) {
        localStorage.removeItem(STORAGE_KEY);
        return [{ id: genId(), title: deriveTitle(legacy), messages: legacy, updatedAt: Date.now() }];
      }
    } catch (e) {}
    return [];
  }

  function saveConversations() {
    localStorage.setItem(CONV_KEY, JSON.stringify(conversations));
    localStorage.setItem(ACTIVE_KEY, activeId);
  }

  let conversations = loadConversations();
  // persist a migration immediately — if we only kept it in memory, a visitor
  // who leaves without sending a new message would lose it on their next visit,
  // since the old key is already gone and the new one was never actually written
  localStorage.setItem(CONV_KEY, JSON.stringify(conversations));
  let activeId = localStorage.getItem(ACTIVE_KEY);
  let active = conversations.find((c) => c.id === activeId);
  if (!active) {
    // not unshifted into `conversations` yet — see push(), which only archives
    // a conversation once it actually has a real user message in it
    active = conversations[0] || { id: genId(), title: null, messages: [], updatedAt: Date.now() };
    activeId = active.id;
    if (conversations.includes(active)) localStorage.setItem(ACTIVE_KEY, activeId);
  }
  let history = active.messages;

  function showGreeting() {
    const hero = document.createElement("div");
    hero.className = "flex justify-center py-1";
    hero.innerHTML = `<dotlottie-wc src="${LOTTIE_ASSISTANT}" autoplay loop class="w-20 h-20 block"></dotlottie-wc>`;
    log.appendChild(hero);
    if (bubbleResizeObserver) bubbleResizeObserver.observe(hero);
    push("bot", "Hi! I'm MagicScript — the assistant living on this site. Ask me what I can do. ✨");
  }

  function renderConversation() {
    log.innerHTML = "";
    history.forEach((msg, i) => render(msg, Math.min(i * 40, 400)));
    if (!history.length) showGreeting();
  }

  function newChat() {
    active = { id: genId(), title: null, messages: [], updatedAt: Date.now() };
    activeId = active.id;
    history = active.messages;
    localStorage.setItem(ACTIVE_KEY, activeId);
    renderConversation();
    closeHistoryOverlay();
  }

  function switchConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv || conv === active) { closeHistoryOverlay(); return; }
    active = conv;
    activeId = conv.id;
    history = active.messages;
    localStorage.setItem(ACTIVE_KEY, activeId);
    renderConversation();
    closeHistoryOverlay();
  }

  function deleteConversation(id) {
    conversations = conversations.filter((c) => c.id !== id);
    saveConversations();
    if (id === activeId) {
      if (conversations.length) switchConversation(conversations[0].id);
      else newChat();
    }
    renderHistoryList();
  }

  function renderHistoryList() {
    const list = panel.querySelector("#ms-history-list");
    list.innerHTML = "";
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!sorted.length) {
      const empty = document.createElement("div");
      empty.className = "text-center text-slate-400 text-sm py-8 px-4";
      empty.textContent = "No previous conversations yet.";
      list.appendChild(empty);
      return;
    }
    sorted.forEach((conv) => {
      const last = conv.messages[conv.messages.length - 1];
      const row = document.createElement("div");
      row.className =
        "flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors border " +
        (conv.id === activeId ? "bg-indigo-50 border-indigo-200" : "border-transparent");
      row.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(conv.title || "New chat")}</div>
          <div class="text-xs text-slate-400 truncate">${escapeHtml(last ? last.text : "")}</div>
        </div>
        <span class="text-[11px] text-slate-400 flex-shrink-0">${timeAgo(conv.updatedAt)}</span>
        <button data-del title="Delete" class="text-slate-300 hover:text-red-500 flex-shrink-0 px-1 bg-transparent border-none cursor-pointer"><i class="fa-solid fa-trash-can text-xs"></i></button>
      `;
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        switchConversation(conv.id);
      });
      row.querySelector("[data-del]").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteConversation(conv.id);
      });
      list.appendChild(row);
    });
  }

  const historyOverlay = panel.querySelector("#ms-history");
  function openHistoryOverlay() {
    renderHistoryList();
    historyOverlay.classList.remove("hidden");
    historyOverlay.classList.add("flex");
  }
  function closeHistoryOverlay() {
    historyOverlay.classList.remove("flex");
    historyOverlay.classList.add("hidden");
  }

  // Keeps the log pinned to its latest message regardless of what caused the
  // change. Two complementary observers, because each catches a different cause:
  // MutationObserver reacts to a message being appended/removed; ResizeObserver
  // reacts to an already-appended bubble's rendered SIZE changing afterward —
  // which happens because Tailwind's CDN build is a JIT that scans the DOM and
  // injects CSS for newly-seen classes (like an arbitrary delay-[420ms]) on its
  // own async schedule. A message can paint briefly unstyled, then jump to its
  // real padded/rounded size once that CSS lands — a reflow no DOM mutation
  // occurs for, so MutationObserver alone missed it and the log stayed scrolled
  // to where "the bottom" was before that jump.
  new MutationObserver(() => { log.scrollTop = log.scrollHeight; }).observe(log, { childList: true, subtree: true });
  const bubbleResizeObserver = "ResizeObserver" in window
    ? new ResizeObserver(() => { log.scrollTop = log.scrollHeight; })
    : null;

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
    if (bubbleResizeObserver) bubbleResizeObserver.observe(div);
    requestAnimationFrame(() => {
      div.classList.remove("opacity-0", "translate-y-3", "scale-90");
      div.classList.add("opacity-100", "translate-y-0", "scale-100");
    });
  }

  function push(role, text) {
    const msg = { role, text };
    history.push(msg);
    active.updatedAt = Date.now();
    // only a real user message earns this conversation a spot in the archive —
    // otherwise clicking "New chat" and never typing anything would clutter the
    // list with empty threads containing just the canned greeting
    if (role === "user") {
      if (!active.title) active.title = deriveTitle(history);
      if (!conversations.includes(active)) conversations.unshift(active);
    }
    if (conversations.includes(active)) saveConversations();
    else localStorage.setItem(ACTIVE_KEY, activeId);
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
    div.className = "max-w-[85%] self-start bg-slate-200 rounded-2xl rounded-bl-sm px-3 py-2 flex items-center";
    div.innerHTML = `<dotlottie-wc src="${LOTTIE_TYPING}" autoplay loop class="w-10 h-6 block"></dotlottie-wc>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    if (bubbleResizeObserver) bubbleResizeObserver.observe(div);
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
        // show the model's own short contextual line (e.g. "Here's a bit of what we
        // can do for you" vs "Here's your chart!") rather than one fixed message —
        // the prompt enforces that it stays a one-liner, never a preview of the page
        push("bot", chatText || "Here's your view! ✨");
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
    pingRing.remove(); // they've found the chat — stop inviting the click
    if (!log.hasChildNodes()) {
      // stagger each historical message's entrance; live messages (via push) pop in immediately
      history.forEach((msg, i) => render(msg, Math.min(160 + i * 60, 560)));
      if (!history.length) showGreeting();
    }
    log.scrollTop = log.scrollHeight; // the MutationObserver/ResizeObserver above only fire on later changes
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

  panel.querySelector("#ms-new").addEventListener("click", newChat);
  panel.querySelector("#ms-history-btn").addEventListener("click", openHistoryOverlay);
  panel.querySelector("#ms-history-back").addEventListener("click", closeHistoryOverlay);

  panel.querySelector("#ms-clear").addEventListener("click", () => {
    conversations = [];
    localStorage.removeItem(CONV_KEY);
    localStorage.removeItem(STORAGE_KEY);
    active = { id: genId(), title: null, messages: [], updatedAt: Date.now() };
    activeId = active.id;
    history = active.messages;
    localStorage.setItem(ACTIVE_KEY, activeId);
    log.innerHTML = "";
    push("bot", "All conversations cleared. Fresh start! ✨");
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
