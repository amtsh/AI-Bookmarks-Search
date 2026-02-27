# AI Bookmarks Search

Effective date: February 27, 2026

AI Bookmarks Search is a Chrome extension that helps users search their bookmarks, including optional AI-powered matching using a user-selected provider (Google Gemini, OpenAI, or Anthropic).

## Data Access

- Bookmarks data (titles and URLs) from your Chrome bookmarks, used to provide search and suggestions.
- User input in the extension (search/chat prompts), used to generate results.
- Authentication information (your API key for the provider you choose).
- Local settings and cache data stored with chrome.storage.local.

## How Data Is Used

- To provide core extension functionality (bookmark search, suggestions, AI responses).
- To call the selected AI provider API only when you submit a request.

## Data Sharing

- We do not sell user data.
- We do not share user data with third parties except the AI provider you explicitly configure and use to process your request.

## Data Storage

- Settings and API keys are stored locally in your browser using chrome.storage.local.
- Bookmark data is read from Chrome bookmarks for runtime use.
- We do not operate our own backend server for this extension.

## Remote Code

- The extension does not load or execute remote code.
- API responses are treated as data, not executable scripts.

## Your Choices

- You can remove API keys or uninstall the extension at any time.
- You can manage bookmarks directly in Chrome.

## Contact

For questions, contact: amtsh@pm.me
