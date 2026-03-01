const SETTINGS_KEY = "settings";
const GEMINI_MODEL_CACHE_KEY = "geminiModelCache";
const AI_BOOKMARKS_FOLDER_TITLE = "AI Find Bookmarks";
const AI_BOOKMARKS_FOLDER_ID_KEY = "aiBookmarksFolderId";
const GEMINI_MODEL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_PAGE_SIZE = 5;
const LOCAL_MATCH_MAX = 30;
const BOOKMARK_CONTEXT_MAX = 100;
const CHAT_HISTORY_MAX_MESSAGES = 6;
const MAX_RESPONSE_TOKENS = 512;
const INPUT_SUGGESTION_MAX = 5;
const OPENAI_MODEL = "gpt-4o-mini";
const CLAUDE_MODEL = "claude-3-5-haiku-latest";

const state = {
  bookmarks: [],
  settings: {
    provider: "gemini",
    geminiKey: "",
    openaiKey: "",
    claudeKey: "",
  },
  providerRotationSeed: 0,
  chatHistory: [],
  inputSuggestions: [],
  suggestionIndex: -1,
  suggestionsVisible: false,
  suggestionQuery: "",
  openaiResponseId: null,
};

const els = {
  tabButtons: [...document.querySelectorAll(".tab-button")],
  panels: {
    chat: document.getElementById("panel-chat"),
    settings: document.getElementById("panel-settings"),
  },
  openAllBookmarks: document.getElementById("open-all-bookmarks"),
  provider: document.getElementById("provider"),
  geminiKey: document.getElementById("gemini-key"),
  openaiKey: document.getElementById("openai-key"),
  claudeKey: document.getElementById("claude-key"),
  settingsForm: document.getElementById("settings-form"),
  chatMissingKey: document.getElementById("chat-missing-key"),
  chatMessages: document.getElementById("chat-messages"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  chatSuggestions: document.getElementById("chat-suggestions"),
  chatSuggestionList: document.getElementById("chat-suggestion-list"),
};

init().catch(() => {});

async function init() {
  applyLayoutMode();
  window.addEventListener("resize", applyLayoutMode);
  wireTabs();
  wireHeader();
  wireSettings();
  wireChat();

  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  state.settings = {
    ...state.settings,
    ...(result[SETTINGS_KEY] || {}),
  };

  await refreshBookmarksFromChrome();
  renderSettings();
  updateChatAvailability();
  els.chatInput.focus();
}

function applyLayoutMode() {
  const isPopup = window.innerWidth <= 500 && window.innerHeight <= 700;
  document.body.classList.toggle("is-popup", isPopup);
}

function wireTabs() {
  els.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      els.tabButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      Object.entries(els.panels).forEach(([key, panel]) => {
        panel.classList.toggle("active", key === tab);
      });
    });
  });
}

function wireHeader() {
  els.openAllBookmarks?.addEventListener("click", async () => {
    await openUrlInNewTab("chrome://bookmarks/");
  });
}

function wireSettings() {
  els.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    state.settings = {
      provider: els.provider.value,
      geminiKey: els.geminiKey.value.trim(),
      openaiKey: els.openaiKey.value.trim(),
      claudeKey: els.claudeKey.value.trim(),
    };

    // Settings are persisted locally only (privacy-first).
    await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
    updateChatAvailability();
  });
}

function renderSettings() {
  els.provider.value = state.settings.provider;
  els.geminiKey.value = state.settings.geminiKey;
  els.openaiKey.value = state.settings.openaiKey;
  els.claudeKey.value = state.settings.claudeKey;
}

function normalizeUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function normalizeForMatch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenBookmarkTree(rootNode) {
  const bookmarks = [];
  const stack = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.url) {
      const site = siteLabel(node.url);
      bookmarks.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        savedAt: new Date(node.dateAdded || Date.now()).toISOString(),
        // Pre-calculate search-critical fields for performance in large libraries.
        _site: site.toLowerCase(),
        _titleNormalized: normalizeForMatch(node.title || node.url),
        _urlNormalized: (node.url || "").toLowerCase(),
      });
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      stack.push(...node.children);
    }
  }

  return bookmarks;
}

async function getOrCreateAiBookmarksFolderId() {
  const cached = await chrome.storage.local.get([AI_BOOKMARKS_FOLDER_ID_KEY]);
  const cachedId = cached[AI_BOOKMARKS_FOLDER_ID_KEY];

  if (cachedId) {
    try {
      const node = await chrome.bookmarks.get(cachedId);
      if (node && node[0] && !node[0].url) return cachedId;
    } catch {
      // Cached folder no longer exists; continue with lookup/create.
    }
  }

  const matches = await chrome.bookmarks.search({
    title: AI_BOOKMARKS_FOLDER_TITLE,
  });
  const folder = matches.find((item) => !item.url);
  if (folder) {
    await chrome.storage.local.set({ [AI_BOOKMARKS_FOLDER_ID_KEY]: folder.id });
    return folder.id;
  }

  let created;
  try {
    created = await chrome.bookmarks.create({
      parentId: "1",
      title: AI_BOOKMARKS_FOLDER_TITLE,
    });
  } catch {
    created = await chrome.bookmarks.create({
      title: AI_BOOKMARKS_FOLDER_TITLE,
    });
  }
  await chrome.storage.local.set({ [AI_BOOKMARKS_FOLDER_ID_KEY]: created.id });
  return created.id;
}

async function refreshBookmarksFromChrome() {
  const folderId = await getOrCreateAiBookmarksFolderId();
  const subtree = await chrome.bookmarks.getSubTree(folderId);
  const root = subtree && subtree[0];
  state.bookmarks = root ? flattenBookmarkTree(root) : [];
  state.bookmarks.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );

  if (document.activeElement === els.chatInput && els.chatInput.value.trim()) {
    updateSuggestions(els.chatInput.value);
  }

  renderBookmarks();
}

function renderBookmarks() {
  // Bookmark tab UI removed; keep function for state-sync call sites.
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

const debouncedUpdateSuggestions = debounce((val) => {
  updateSuggestions(val);
}, 120);

function wireChat() {
  els.chatMessages.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest(".chat-inline-link, .chat-bookmark-card");
    if (!(link instanceof HTMLAnchorElement)) return;

    event.preventDefault();
    await openUrlInNewTab(link.href);
  });

  els.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = els.chatInput.value.trim();
    if (!content) return;

    els.chatInput.value = "";
    pushMessage("user", content);

    if (isListAllBookmarksIntent(content)) {
      pushMessage(
        "assistant",
        "Open All Bookmarks at the top to see your full saved list.",
      );
      return;
    }

    const localAnswer = tryResolveLocalAnswer(content);
    if (localAnswer) {
      pushMessage("assistant", localAnswer);
      return;
    }

    if (!canChat()) {
      pushMessage("assistant", "Add an API key in Settings to continue.");
      return;
    }

    try {
      const response = await askAI(content);
      pushMessage("assistant", response || "No response received.");
    } catch (error) {
      pushMessage("assistant", error.message || "Request failed.");
    }
  });

  els.chatInput.addEventListener("input", () => {
    debouncedUpdateSuggestions(els.chatInput.value);
  });

  els.chatInput.addEventListener("focus", () => {
    if (els.chatInput.value.trim()) {
      updateSuggestions(els.chatInput.value);
    }
  });

  els.chatInput.addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && els.chatForm.contains(active)) return;
      hideSuggestions();
    }, 120);
  });

  els.chatInput.addEventListener("keydown", async (event) => {
    if (!state.suggestionsVisible || state.inputSuggestions.length === 0)
      return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const len = state.inputSuggestions.length;
      const next = state.suggestionIndex < 0 ? 0 : (state.suggestionIndex + 1) % len;
      setSuggestionIndex(next);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const len = state.inputSuggestions.length;
      const next = state.suggestionIndex <= 0 ? len - 1 : state.suggestionIndex - 1;
      setSuggestionIndex(next);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      hideSuggestions();
      return;
    }

    if (event.key === "Enter") {
      const index =
        state.suggestionIndex >= 0 ? state.suggestionIndex : 0;
      event.preventDefault();
      await openSuggestionAtIndex(index);
      return;
    }

    if (event.key === "Tab") {
      hideSuggestions();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!els.chatForm.contains(target)) {
      hideSuggestions();
    }
  });
}

function canChat() {
  return hasAnyProviderKey();
}

function updateChatAvailability() {
  const enabled = canChat();
  els.chatMissingKey.classList.toggle("hidden", enabled);
}

function pushMessage(role, content, options = {}) {
  state.chatHistory.push({ role, content });
  if (role === "user") {
    hideSuggestions();
  }
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;

  const label = document.createElement("span");
  label.className = "chat-message-label";
  label.textContent = role === "user" ? "You" : "AI";
  message.append(label);

  if (role === "assistant") {
    const previewBookmarks = extractPreviewBookmarks(content);
    if (previewBookmarks.length > 0) {
      renderBookmarkPreviews(message, previewBookmarks);
    } else {
      const cleanedContent = normalizeAssistantText(content, false);
      message.append(renderLinkifiedText(cleanedContent));
    }
  } else {
    const textEl = document.createElement("div");
    textEl.className = "chat-text";
    textEl.textContent = content;
    message.append(textEl);
  }

  els.chatMessages.append(message);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function updateSuggestions(query) {
  const normalized = normalizeForMatch(query);
  state.suggestionQuery = query;

  if (!normalized || query.trim().length < 2) {
    hideSuggestions();
    return;
  }

  state.inputSuggestions = selectInputSuggestions(query, INPUT_SUGGESTION_MAX);
  state.suggestionIndex = -1;

  if (state.inputSuggestions.length === 0) {
    hideSuggestions();
    return;
  }

  showSuggestions();
}

function selectInputSuggestions(query, limit) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return [];

  const scored = state.bookmarks
    .map((bookmark) => {
      const title = bookmark._titleNormalized;
      const host = bookmark._site;
      const url = bookmark._urlNormalized;

      const inTitle = title.includes(q);
      const inHost = host.includes(q);
      const inUrl = url.includes(q);
      if (!inTitle && !inHost && !inUrl) return null;

      let score = 0;
      if (title.startsWith(q) || host.startsWith(q)) score += 30;
      if (inTitle) score += 12;
      if (inHost) score += 10;
      if (inUrl) score += 6;

      return { bookmark, score };
    })
    .filter(Boolean);

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return previewTimestamp(b.bookmark) - previewTimestamp(a.bookmark);
    })
    .slice(0, limit)
    .map((item) => item.bookmark);
}

function showSuggestions() {
  state.suggestionsVisible = true;
  els.chatSuggestions.classList.remove("hidden");
  els.chatInput.setAttribute("aria-expanded", "true");
  if (state.suggestionIndex >= 0) {
    els.chatInput.setAttribute(
      "aria-activedescendant",
      `suggestion-${state.suggestionIndex}`,
    );
  }
  renderSuggestions();
}

function hideSuggestions() {
  state.suggestionsVisible = false;
  state.inputSuggestions = [];
  state.suggestionIndex = -1;
  els.chatSuggestions.classList.add("hidden");
  els.chatInput.setAttribute("aria-expanded", "false");
  els.chatInput.removeAttribute("aria-activedescendant");
  els.chatSuggestionList.innerHTML = "";
}

function setSuggestionIndex(index) {
  if (state.inputSuggestions.length === 0) {
    state.suggestionIndex = -1;
    els.chatInput.removeAttribute("aria-activedescendant");
    return;
  }

  const prev = state.suggestionIndex;
  state.suggestionIndex = Math.max(
    0,
    Math.min(index, state.inputSuggestions.length - 1),
  );

  if (prev >= 0 && prev !== state.suggestionIndex) {
    const prevEl = document.getElementById(`suggestion-${prev}`);
    if (prevEl) {
      prevEl.classList.remove("active");
      prevEl.setAttribute("aria-selected", "false");
    }
  }

  const activeEl = document.getElementById(`suggestion-${state.suggestionIndex}`);
  if (activeEl) {
    activeEl.classList.add("active");
    activeEl.setAttribute("aria-selected", "true");
    activeEl.scrollIntoView({ block: "nearest" });
  }

  els.chatInput.setAttribute(
    "aria-activedescendant",
    `suggestion-${state.suggestionIndex}`,
  );
}

function renderSuggestions() {
  els.chatSuggestionList.innerHTML = "";

  state.inputSuggestions.forEach((bookmark, index) => {
    const item = document.createElement("li");
    item.id = `suggestion-${index}`;
    item.className = `chat-suggestion-item${index === state.suggestionIndex ? " active" : ""}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === state.suggestionIndex));

    const icon = document.createElement("span");
    icon.className = "chat-bookmark-icon";
    icon.textContent = bookmarkIconLetter(bookmark);
    icon.style.background = bookmarkIconBackground(siteLabel(bookmark.url));

    const text = document.createElement("div");
    text.className = "chat-suggestion-text";

    const title = document.createElement("p");
    title.className = "chat-suggestion-title";
    title.textContent = bookmark.title || bookmark.url;

    const meta = document.createElement("p");
    meta.className = "chat-suggestion-meta";
    meta.textContent = siteLabel(bookmark.url);

    text.append(title, meta);
    item.append(icon, text);

    item.addEventListener("mouseenter", () => {
      setSuggestionIndex(index);
    });
    item.addEventListener("mousedown", async (event) => {
      event.preventDefault();
      await openSuggestionAtIndex(index);
    });

    els.chatSuggestionList.append(item);
  });
}

async function openSuggestionAtIndex(index) {
  const bookmark = state.inputSuggestions[index];
  if (!bookmark || !bookmark.url) return;
  await openUrlInNewTab(bookmark.url);
  hideSuggestions();
}

async function openUrlInNewTab(url) {
  if (!url) return;
  try {
    await chrome.tabs.create({ url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function renderLinkifiedText(content) {
  const container = document.createElement("div");
  container.className = "chat-text";

  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  let lastIndex = 0;
  let match = urlRegex.exec(content);

  while (match) {
    const [rawUrl] = match;
    const start = match.index;
    if (start > lastIndex) {
      container.append(
        document.createTextNode(content.slice(lastIndex, start)),
      );
    }

    const link = document.createElement("a");
    link.href = rawUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "chat-inline-link";
    link.textContent = rawUrl;
    container.append(link);

    lastIndex = start + rawUrl.length;
    match = urlRegex.exec(content);
  }

  if (lastIndex < content.length) {
    container.append(document.createTextNode(content.slice(lastIndex)));
  }

  return container;
}

function extractUrls(content) {
  const matches = content.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const unique = [];
  const seen = new Set();

  matches.forEach((url) => {
    if (!seen.has(url)) {
      seen.add(url);
      unique.push(url);
    }
  });

  return unique.slice(0, 100);
}

function extractDomainCandidates(content) {
  const matches =
    content.match(
      /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?/gi,
    ) || [];
  const unique = [];
  const seen = new Set();

  matches.forEach((value) => {
    const candidate = String(value || "").toLowerCase();
    if (!seen.has(candidate)) {
      seen.add(candidate);
      unique.push(candidate);
    }
  });

  return unique.slice(0, 10);
}

function extractPreviewBookmarks(content) {
  const byId = new Map();
  const directUrls = extractUrls(content);
  const domainMentions = extractDomainCandidates(content);

  directUrls.forEach((url) => {
    const normalized = normalizeUrl(url);
    const bookmark =
      state.bookmarks.find((item) => normalizeUrl(item.url) === normalized) ||
      state.bookmarks.find((item) => item._site === siteLabel(url).toLowerCase());
    if (bookmark) {
      byId.set(bookmark.id, bookmark);
      return;
    }

    const externalId = `external:${normalized}`;
    byId.set(externalId, {
      id: externalId,
      title: safeHostname(url),
      url,
    });
  });

  domainMentions.forEach((mention) => {
    const mentionHost = siteLabel(mention.split("/")[0]).toLowerCase();
    const bookmark = state.bookmarks.find(
      (item) => item._site === mentionHost,
    );
    if (bookmark) {
      byId.set(bookmark.id, bookmark);
    }
  });

  // Match bookmark titles when assistant lists names without URLs/domains.
  const titleMatches = extractTitleMentions(content);
  titleMatches.forEach((bookmark) => {
    byId.set(bookmark.id, bookmark);
  });

  return sortPreviewBookmarks(Array.from(byId.values()));
}

function extractTitleMentions(content) {
  const normalizedContent = normalizeForMatch(content);
  if (!normalizedContent) return [];

  const matches = [];
  for (const bookmark of state.bookmarks) {
    const title = bookmark._titleNormalized;
    if (title.length < 4) continue;

    if (normalizedContent.includes(title)) {
      matches.push(bookmark);
      continue;
    }

    const prefix = title.split(" ").slice(0, 4).join(" ").trim();
    if (prefix.length >= 10 && normalizedContent.includes(prefix)) {
      matches.push(bookmark);
    }
  }

  return matches;
}

function normalizeAssistantText(content, hasPreviews) {
  let text = String(content || "");

  // Strip common markdown formatting artifacts for cleaner UI text.
  text = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();

  if (hasPreviews) {
    // If previews are shown, remove raw URLs from text to avoid duplicate clutter.
    text = text
      .split("\n")
      .map((line) => line.replace(/https?:\/\/[^\s<>"')\]]+/gi, "").trim())
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();
  }

  return text;
}

function createBookmarkPreview(bookmark) {
  const url = bookmark.url;
  const card = document.createElement("a");
  card.className = "chat-bookmark-card";
  card.href = url;
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const icon = document.createElement("span");
  icon.className = "chat-bookmark-icon";
  icon.textContent = bookmarkIconLetter(bookmark);
  icon.style.background = bookmarkIconBackground(siteLabel(url));

  const textWrap = document.createElement("div");
  textWrap.className = "chat-bookmark-card-text";

  const title = document.createElement("p");
  title.className = "chat-bookmark-card-title";
  title.textContent = bookmark?.title || safeHostname(url);

  const meta = document.createElement("p");
  meta.className = "chat-bookmark-card-url";
  meta.textContent = siteLabel(url);

  textWrap.append(title, meta);
  card.append(icon, textWrap);
  return card;
}

function bookmarkIconLetter(bookmark) {
  const seed = String(
    bookmark?.title || siteLabel(bookmark?.url || "") || "B",
  ).trim();
  const first = seed.charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : "B";
}

function bookmarkIconBackground(seed) {
  const text = String(seed || "bookmark");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 30% 34%)`;
}

function renderBookmarkPreviews(message, bookmarks) {
  const previews = document.createElement("div");
  previews.className = "chat-bookmark-previews";
  message.append(previews);

  let offset = 0;
  const renderNextBatch = () => {
    const batch = bookmarks.slice(offset, offset + PREVIEW_PAGE_SIZE);
    batch.forEach((bookmark) =>
      previews.append(createBookmarkPreview(bookmark)),
    );
    offset += batch.length;
  };

  renderNextBatch();

  if (offset < bookmarks.length) {
    const loadMore = document.createElement("button");
    loadMore.type = "button";
    loadMore.className = "chat-load-more";
    loadMore.textContent = "Load more";
    loadMore.addEventListener("click", () => {
      renderNextBatch();
      if (offset >= bookmarks.length) {
        loadMore.remove();
      }
    });
    message.append(loadMore);
  }
}

function sortPreviewBookmarks(bookmarks) {
  return [...bookmarks].sort(
    (a, b) => previewTimestamp(b) - previewTimestamp(a),
  );
}

function previewTimestamp(bookmark) {
  const value = Date.parse(bookmark?.savedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function siteLabel(url) {
  return safeHostname(url).replace(/^www\./i, "");
}

function isListAllBookmarksIntent(input) {
  const text = String(input || "").toLowerCase();
  if (!text) return false;
  const asksToList = /\b(list|show|display|see|view)\b/.test(text);
  const mentionsBookmarks =
    /\b(bookmark|bookmarks|saved links|saved urls|saved pages)\b/.test(text);
  return asksToList && mentionsBookmarks;
}

function tryResolveLocalAnswer(input) {
  const text = normalizeForMatch(input);
  if (!text) return null;
  const wantsRecent = /\b(recent|latest|newest|last)\b/.test(text);
  const tokens = extractQueryTokens(input);
  if (!wantsRecent || tokens.length > 0) return null;

  const matches = state.bookmarks.slice(0, LOCAL_MATCH_MAX);
  if (matches.length === 0) return null;
  return matches.map((bookmark) => bookmark.url).join("\n");
}

function extractQueryTokens(input) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "what",
    "show",
    "list",
    "find",
    "about",
    "saved",
    "bookmark",
    "bookmarks",
    "links",
    "link",
    "all",
    "recent",
    "latest",
    "newest",
    "please",
    "into",
    "your",
    "my",
    "me",
    "did",
    "have",
    "get",
    "give",
  ]);
  return normalizeForMatch(input)
    .split(" ")
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

function tokenizeSearchText(value) {
  return normalizeForMatch(value).split(" ").filter(Boolean);
}

function tokenMatchesWord(token, words) {
  if (!token) return false;
  return words.some((word) => {
    if (word === token) return true;
    if (token.length >= 3 && word.startsWith(token)) return true;
    if (token.length >= 3 && word.includes(token)) return true;
    return false;
  });
}

function selectRelevantBookmarks(input, maxCount) {
  const normalizedInput = normalizeForMatch(input);
  const tokens = extractQueryTokens(input);
  const domains = extractDomainCandidates(input).map((d) =>
    siteLabel(d.split("/")[0]).toLowerCase(),
  );
  const wantsRecent = /\b(recent|latest|newest|last)\b/.test(normalizedInput);

  const scored = state.bookmarks.map((bookmark) => {
    const allWords = tokenizeSearchText(`${bookmark.title} ${bookmark.url}`);
    const normalizedTitle = bookmark._titleNormalized;
    const host = bookmark._site;
    let score = 0;
    let domainHit = false;
    let tokenHitCount = 0;

    domains.forEach((domain) => {
      if (host.includes(domain)) {
        score += 12;
        domainHit = true;
      }
    });

    tokens.forEach((token) => {
      if (tokenMatchesWord(token, allWords)) {
        tokenHitCount += 1;
        // Higher score if token appears in title
        const inTitle = bookmark._titleNormalized.includes(token);
        score += inTitle ? 8 : 4;
      } else if (normalizedTitle.includes(token)) {
        tokenHitCount += 1;
        score += 3;
      }
    });

    if (tokens.length >= 2 && tokenHitCount >= 2) score += 5;

    if (wantsRecent) {
      score += 2;
    }

    return { bookmark, score, tokenHitCount, domainHit };
  });

  // Accept any bookmark with at least 1 token hit (OR-matching).
  let matches = scored.filter((item) => {
    if (item.domainHit) return true;
    if (tokens.length > 0) return item.tokenHitCount >= 1;
    return item.score > 0;
  });

  if (matches.length === 0 && wantsRecent) {
    matches = scored;
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return previewTimestamp(b.bookmark) - previewTimestamp(a.bookmark);
  });

  return matches.slice(0, maxCount).map((item) => item.bookmark);
}

function buildConversationWindow() {
  const full = state.chatHistory.filter(
    (item) => item.role === "user" || item.role === "assistant",
  );
  if (full.length <= CHAT_HISTORY_MAX_MESSAGES) {
    return {
      recentMessages: normalizeConversationMessages(full),
      historySummary: "",
    };
  }

  const recentMessages = normalizeConversationMessages(
    full.slice(-CHAT_HISTORY_MAX_MESSAGES),
  );
  const older = full.slice(0, -CHAT_HISTORY_MAX_MESSAGES);
  return {
    recentMessages,
    historySummary: summarizeOlderMessages(older),
  };
}

function normalizeConversationMessages(messages) {
  const normalized = messages
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role, content: item.content }));

  while (normalized.length > 0 && normalized[0].role === "assistant") {
    normalized.shift();
  }

  return normalized;
}

function stripLatestUserEcho(messages, userInput) {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.role !== "user") return messages;
  if (String(last.content || "").trim() !== String(userInput || "").trim())
    return messages;
  return messages.slice(0, -1);
}

function summarizeOlderMessages(messages) {
  const userIntents = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => compactText(m.content, 70));
  const assistantReplies = messages
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => compactText(m.content, 70));

  const parts = [];
  if (userIntents.length > 0) {
    parts.push(`User intents: ${userIntents.join(" | ")}`);
  }
  if (assistantReplies.length > 0) {
    parts.push(`Assistant replies: ${assistantReplies.join(" | ")}`);
  }
  return parts.join(". ");
}

function compactText(text, maxLen) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}

function formatBookmarksForPrompt(bookmarks) {
  return bookmarks
    .map((b, i) => {
      const desc = b.description ? ` — ${b.description}` : "";
      return `${i + 1}. ${b.title}${desc} | ${b.url}`;
    })
    .join("\n");
}

function buildSystemPrompt(bookmarks, historySummary) {
  const list = formatBookmarksForPrompt(bookmarks);
  return (
    `You are AI Bookmarks Search, a bookmark search assistant. The user has ${bookmarks.length} saved bookmarks.\n\n` +
    `BOOKMARKS:\n${list}\n\n` +
    (historySummary
      ? `EARLIER CONVERSATION CONTEXT:\n${historySummary}\n\n`
      : "") +
    "INSTRUCTIONS:\n" +
    "- Each bookmark has a title, an optional description of the page's content, and a URL.\n" +
    "- Use the title, description, URL, and your knowledge of what these websites/pages do to understand each bookmark's purpose.\n" +
    "- Find bookmarks matching the user's query by topic, keyword, domain, or semantic meaning — not just exact text matches.\n" +
    "- Return matching bookmarks as a list. Always include the full URL for each result so the user can click through.\n" +
    "- If no bookmarks match, say so clearly.\n" +
    "- For general questions about the collection (counts, topics, domains), answer directly.\n" +
    "- Be concise. No preamble or filler."
  );
}

async function askAI(userInput) {
  const bookmarks =
    state.bookmarks.length <= BOOKMARK_CONTEXT_MAX
      ? state.bookmarks
      : selectRelevantBookmarks(userInput, BOOKMARK_CONTEXT_MAX);

  const { recentMessages, historySummary } = buildConversationWindow();
  const modelHistory = stripLatestUserEcho(recentMessages, userInput);
  const systemPrompt = buildSystemPrompt(bookmarks, historySummary);

  const providerOrder = getProviderOrder();
  if (providerOrder.length === 0) {
    throw new Error("Add an API key in Settings to start chatting.");
  }

  let sawQuotaError = false;
  const quotaProviders = [];
  for (let i = 0; i < providerOrder.length; i += 1) {
    const provider = providerOrder[i];
    const hasNext = i < providerOrder.length - 1;

    try {
      let response = "";
      if (provider === "openai") {
        response = await requestOpenAI(systemPrompt, userInput);
      } else if (provider === "claude") {
        response = await requestClaude(systemPrompt, userInput, modelHistory);
      } else {
        response = await requestGemini(systemPrompt, userInput, modelHistory);
      }

      advanceProviderRotation(provider);
      if (provider !== "openai") {
        state.openaiResponseId = null;
      }
      return response;
    } catch (error) {
      if (isQuotaError(error)) {
        sawQuotaError = true;
        quotaProviders.push(error.provider || provider);
        if (hasNext) continue;
        break;
      }
      throw error;
    }
  }

  if (sawQuotaError) {
    const tried =
      quotaProviders.length > 0 ? ` (${quotaProviders.join(", ")})` : "";
    throw new Error(
      `Provider quota/rate-limit reached${tried}. Add quota or switch provider key in Settings.`,
    );
  }

  throw new Error("Request failed.");
}

function getProviderOrder() {
  const selected = normalizeProvider(state.settings.provider);
  const available = ["gemini", "openai", "claude"].filter((provider) =>
    hasProviderKey(provider),
  );
  if (available.length === 0) return [];

  // Keep selected provider first when configured, then rotate fallbacks in round-robin order.
  if (hasProviderKey(selected)) {
    const fallback = rotateProviders(
      available.filter((provider) => provider !== selected),
      state.providerRotationSeed,
    );
    return [selected, ...fallback];
  }

  return rotateProviders(available, state.providerRotationSeed);
}

function rotateProviders(list, seed) {
  if (list.length <= 1) return [...list];
  const offset = ((seed % list.length) + list.length) % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function advanceProviderRotation(successProvider) {
  const available = ["gemini", "openai", "claude"].filter((provider) =>
    hasProviderKey(provider),
  );
  if (available.length <= 1) return;

  const index = available.indexOf(successProvider);
  if (index === -1) return;
  state.providerRotationSeed = (index + 1) % available.length;
}

function normalizeProvider(provider) {
  if (provider === "openai" || provider === "claude") return provider;
  return "gemini";
}

function hasProviderKey(provider) {
  if (provider === "openai") return Boolean(state.settings.openaiKey);
  if (provider === "claude") return Boolean(state.settings.claudeKey);
  return Boolean(state.settings.geminiKey);
}

function hasAnyProviderKey() {
  return (
    Boolean(state.settings.geminiKey) ||
    Boolean(state.settings.openaiKey) ||
    Boolean(state.settings.claudeKey)
  );
}

async function requestOpenAI(systemPrompt, userInput) {
  const { recentMessages } = buildConversationWindow();
  const messages = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: userInput },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.settings.openaiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: MAX_RESPONSE_TOKENS,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const err = await safeJson(response);
    const message = err?.error?.message || `HTTP ${response.status}`;
    throw createApiError(message, response.status, "openai", {
      code: err?.error?.code,
      type: err?.error?.type,
    });
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || "No response.";
}

async function requestClaude(systemPrompt, userInput, recentMessages) {
  const messages = [
    ...recentMessages.map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: userInput },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": state.settings.claudeKey,
      "anthropic-version": "2023-06-01",
      // Required for direct browser/extension calls to Anthropic API.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_RESPONSE_TOKENS,
      temperature: 0.2,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await safeJson(response);
    const message =
      err?.error?.message || err?.message || `HTTP ${response.status}`;
    throw createApiError(message, response.status, "claude", {
      code: err?.error?.type || err?.type,
      type: err?.error?.type || err?.type,
    });
  }

  const data = await response.json();
  const text =
    Array.isArray(data?.content) && data.content[0] && data.content[0].text
      ? data.content[0].text.trim()
      : "";
  return text || "No response.";
}

async function requestGemini(systemPrompt, userInput, recentMessages) {
  const cachedModel = await getCachedGeminiModel();
  const models = cachedModel ? [cachedModel] : [];
  if (models.length === 0) {
    const discoveredModel = await discoverGeminiModel();
    models.push(discoveredModel);
  }

  let lastError = "Gemini request failed.";
  for (const model of models) {
    const response = await callGeminiGenerateContent(
      model,
      systemPrompt,
      userInput,
      recentMessages,
    );
    if (response.ok) {
      const data = await response.json();
      await cacheGeminiModel(model);
      return (
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
        "No response."
      );
    }

    const err = await safeJson(response);
    lastError = err?.error?.message || `HTTP ${response.status}`;
    if (!isGeminiModelNotFound(lastError)) {
      throw createApiError(lastError, response.status, "gemini", {
        code: err?.error?.status,
        type: err?.error?.status,
      });
    }
  }

  const refreshedModel = await discoverGeminiModel();
  const retryResponse = await callGeminiGenerateContent(
    refreshedModel,
    systemPrompt,
    userInput,
    recentMessages,
  );
  if (!retryResponse.ok) {
    const retryErr = await safeJson(retryResponse);
    const message = retryErr?.error?.message || `HTTP ${retryResponse.status}`;
    throw createApiError(message, retryResponse.status, "gemini", {
      code: retryErr?.error?.status,
      type: retryErr?.error?.status,
    });
  }

  const retryData = await retryResponse.json();
  await cacheGeminiModel(refreshedModel);
  return (
    retryData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "No response."
  );
}

async function callGeminiGenerateContent(
  model,
  systemPrompt,
  userInput,
  recentMessages,
) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` +
    encodeURIComponent(state.settings.geminiKey);

  const contents = recentMessages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
  contents.push({ role: "user", parts: [{ text: userInput }] });

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        maxOutputTokens: MAX_RESPONSE_TOKENS,
        temperature: 0.2,
      },
      contents,
    }),
  });
}

async function discoverGeminiModel() {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models?key=" +
    encodeURIComponent(state.settings.geminiKey);
  const response = await fetch(url);
  if (!response.ok) {
    const err = await safeJson(response);
    throw new Error(err?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  const supported = models.filter(
    (model) =>
      Array.isArray(model?.supportedGenerationMethods) &&
      model.supportedGenerationMethods.includes("generateContent"),
  );

  if (supported.length === 0) {
    throw new Error("No Gemini models available for generateContent.");
  }

  // Prefer flash models for speed/cost, fallback to first supported model.
  const preferred =
    supported.find((model) => /flash/i.test(model?.name || "")) || supported[0];
  const name = String(preferred?.name || "");
  return name.replace(/^models\//, "");
}

async function getCachedGeminiModel() {
  const result = await chrome.storage.local.get([GEMINI_MODEL_CACHE_KEY]);
  const cache = result[GEMINI_MODEL_CACHE_KEY];
  if (!cache || !cache.model || !cache.savedAt) return null;
  if (Date.now() - cache.savedAt > GEMINI_MODEL_CACHE_TTL_MS) return null;
  return cache.model;
}

async function cacheGeminiModel(model) {
  await chrome.storage.local.set({
    [GEMINI_MODEL_CACHE_KEY]: {
      model,
      savedAt: Date.now(),
    },
  });
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isGeminiModelNotFound(message) {
  const text = String(message || "").toLowerCase();
  return text.includes("not found") || text.includes("listmodels");
}

function createApiError(message, status, provider, meta = {}) {
  const error = new Error(message);
  error.status = status;
  error.provider = provider;
  error.code = meta.code;
  error.type = meta.type;
  error.isQuota = isQuotaErrorMessage(message, status, meta.code, meta.type);
  return error;
}

function isQuotaError(error) {
  if (!error) return false;
  if (error.isQuota) return true;
  return isQuotaErrorMessage(error.message, error.status);
}

function isQuotaErrorMessage(message, status, code, type) {
  const text = String(message || "").toLowerCase();
  const errCode = String(code || "").toLowerCase();
  const errType = String(type || "").toLowerCase();
  if (status === 429) return true;
  if (
    errCode.includes("insufficient_quota") ||
    errType.includes("insufficient_quota")
  )
    return true;
  if (
    errCode.includes("resource_exhausted") ||
    errType.includes("resource_exhausted")
  )
    return true;
  if (errCode.includes("rate_limit") || errType.includes("rate_limit"))
    return true;
  return (
    text.includes("insufficient_quota") ||
    text.includes("resource exhausted") ||
    text.includes("resource has been exhausted") ||
    text.includes("insufficient_quota") ||
    text.includes("rate limit") ||
    text.includes("too many requests")
  );
}
