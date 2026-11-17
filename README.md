# Text Fight

A mobile-first, installable fiction-writing app. Vanilla HTML, CSS, and JavaScript; no account, API key, package installation, or build service is needed to write. Includes 950 original Sentence Trainer craft entries and explanations plus 24 additional sentence starters (974 craft entries total) and 1,168 offline vocabulary entries. The original Sentence Trainer repository was read only.

## Try locally

With Node.js 24 or later:

```sh
npm start
```

Open `http://localhost:4173` on that computer. Use **Continue a draft** for vocabulary, starters, enders, and craft devices, or **Start a drill** for all seven categories. You can paste an existing manuscript before starting a round; its words become the baseline.

Localhost is a desktop development preview. Use HTTPS deployment below to open the app on your phone and install it.

## Simplest phone-ready HTTPS deployment: GitHub Pages

The ready-to-upload app is in `dist/`.

1. Create a public GitHub repository named `text-fight-2` in the `KgitWH21` account, or open your intended existing repository. (This session could not find `KgitWH21/text-fight-2` through the GitHub connector.)
2. In GitHub choose **Add file → Upload files**. Upload **everything inside `dist/`**, including `data/` and `icons/`, to the repository's `main` branch root. Commit the upload.
3. In **Settings → Pages**, select **Deploy from a branch**, **main**, **/(root)**, then **Save**.
4. Wait for the Pages deployment to finish. The expected URL for that exact account and repository name is `https://kgitwh21.github.io/text-fight-2/`. This is an expected URL, not a verified live deployment from this session.

For ongoing development, push this complete source tree to your repository instead. The included `.github/workflows/pages.yml` tests and builds `dist/`; choose **GitHub Actions** as the Pages source and run **Deploy Text Fight to GitHub Pages**. There are no runtime dependencies. You can write without a secret. All asset, manifest, and service-worker URLs are relative and support a repository subpath.

Android installation: open the deployed HTTPS link in **Chrome** on your Pixel, wait for the first load, then **⋮ → Add to Home screen → Install**. Settings reports when the offline shell is ready. On Windows, open the same HTTPS URL in Chrome or Edge; use the address-bar install icon if desired. Mirror the installed phone app as you would any other app. Desktop and phone drafts and XP are separate.

An owner-private Sites project was reserved in `.openai/hosting.json`, but publishing its source failed because this environment could not resolve `git.chatgpt-team.site`. No Sites version was saved or published. GitHub Pages is the simplest account-free path for the app itself.

## Writing and progression

- The title and manuscript autosave to this browser's local storage after every edit. Each draft keeps its current round, prompt, pin, timer, session baseline, provenance, and undo journal. Use Drafts (phone) or the sidebar (desktop) to switch.
- The full word count is the document's current total. Session words are **current total minus the fixed total when this round started**. A cut can make the session count negative. Tapping, scrolling, and selecting never change the baseline.
- Normal edits earn one XP for each positive word-count change. Corrections with the same word count earn none. Cuts do not remove earned XP. Undo and redo restore previously credited edits and never award word XP again. Newly written prose after a cut can still earn XP.
- Vocabulary is checked as whole words, without case sensitivity, in text affected by a new edit. Original manuscript text cannot claim a word bonus. **Used it** and automatic detection share one five-XP award per dealt card.
- **Copy session text** tracks additions by location, including corrected words, even when writing in the middle. Removed additions disappear from the copy. Separate additions are joined by paragraph breaks when original manuscript text lies between them. The session's copied prose can have a different word count from the *net* session count after replacing or cutting original prose.
- The tools menu (**•••**) offers Copy full draft, Copy session text, and a `.txt` download. Periodic downloads also make a portable backup. Clearing browser site data removes device-local drafts and XP.
- Chill is five minutes, Steady three, Hard one. Custom accepts positive minutes, including fractions. Changing pace restarts only the countdown. Pin holds the card until Unpin; Next now works once released. Pause stops the timer; writing remains available. Hidden/background time is excluded, with no prompt backlog.
- No prompts or fanfares focus the editor or rewrite its contents. Prompt space has a fixed height to avoid shifting the manuscript. Under a short mobile viewport, controls compress and explanations hide to leave more writing room.
- On mobile, tap the fullscreen icon beside **•••** to show only the manuscript editor and the changing prompt box with its countdown. A small exit icon inside that box returns to the regular view. The title, navigation, counts, XP, pace/category controls, prompt actions, and visual fanfares are hidden; autosave and XP continue. An existing round retains its card, pace, pause, and pin state. If no round is active, entering starts a Continue round with the existing draft as its baseline. Choose your pace and categories before entering, or exit to adjust them. The browser's fullscreen API is used when available; otherwise the same minimal app layout remains usable. Keyboard/viewport resizing leaves the editor the remaining space. Refresh returns to the regular view with the draft and round restored.
- Tune XP per word, bonus XP, level spacing, rank names, and rank thresholds together in `PROGRESSION` in `core.js`. Level-up sound is off initially and optional in Settings.
- Ranks follow the original Text Fight ladder: Rookie → Iron → Bronze → Silver → Gold → Platinum → Diamond → Master. Iron through Diamond each have five steps, shown as pips. Original thresholds are applied directly to saved lifetime XP: Iron starts at 120 and Master at 14,320. Master starts Writer Rate at 1500, gaining one rating per 40 XP; High Master, Grand Master, and Ultimate Master start at 1600, 1700, and 1800. Numeric levels still advance every 100 XP. Existing XP, drafts, and rounds are preserved; rank is derived when the app opens. Rank promotions use the existing brief fanfare and sound preference.

The shell, icons, and prompt decks are cached after the first successful online visit. Future workers wait for **Settings → Update app & resume draft**; updates save first and never clear manuscript storage. This browser behavior still requires real-browser verification in the environment described in TESTING.md.

## Refresh Wordnik words

Add a repository secret named `WORDNIK_API_KEY` under **Settings → Secrets and variables → Actions**. Words refresh daily. You can also run the **Refresh words** workflow manually. The key stays in GitHub and never reaches the browser. When the refreshed list is available, vocabulary cards use it. Otherwise you keep the offline word deck.

## Tests and build

```sh
npm test                 # Core, persistence model, manifest, mocked SW cache, and Wordnik refresh tests
npm run build            # Dependency-free static packaging to dist/

# Optional development-only interaction and rendered-browser tests:
npm install --no-save jsdom playwright
npm run test:dom
npx playwright install chromium
npm run test:browser
```

The browser suite targets a 412×915 mobile viewport and a 1440×1000 desktop viewport under `/text-fight-2/`, plus a shortened mobile viewport to approximate keyboard space. Browser emulation does not verify physical Pixel hardware, Android keyboards/dictation, actual installation, or phone mirroring. See [TESTING.md](TESTING.md) for the tests actually completed and environment limitations.
