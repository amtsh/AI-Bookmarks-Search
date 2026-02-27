const AI_BOOKMARKS_FOLDER_TITLE = "AI Find Bookmarks";
const AI_BOOKMARKS_FOLDER_ID_KEY = "aiBookmarksFolderId";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const folderId = await getOrCreateAiBookmarksFolderId();
    await chrome.storage.local.set({ [AI_BOOKMARKS_FOLDER_ID_KEY]: folderId });
  } catch {
    // Keep install flow resilient; popup can still lazily create the folder later.
  }
});

async function getOrCreateAiBookmarksFolderId() {
  const cached = await chrome.storage.local.get([AI_BOOKMARKS_FOLDER_ID_KEY]);
  const cachedId = cached[AI_BOOKMARKS_FOLDER_ID_KEY];

  if (cachedId) {
    try {
      const node = await chrome.bookmarks.get(cachedId);
      if (node && node[0] && !node[0].url) return cachedId;
    } catch {
      // Cached folder no longer exists; continue.
    }
  }

  const matches = await chrome.bookmarks.search({ title: AI_BOOKMARKS_FOLDER_TITLE });
  const existing = matches.find((item) => !item.url);
  if (existing) return existing.id;

  try {
    const created = await chrome.bookmarks.create({
      parentId: "1",
      title: AI_BOOKMARKS_FOLDER_TITLE,
    });
    return created.id;
  } catch {
    const created = await chrome.bookmarks.create({ title: BOOKMARKCHAT_FOLDER_TITLE });
    return created.id;
  }
}
