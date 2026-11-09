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

The ready-to-upload app is in `dist/`; `text-fight-pages.zip` contains exactly that directory's contents at the ZIP root.

1. Create a public GitHub repository named `text-fight-2` in the `KgitWH21` account, or open your intended existing repository. (This session could not find `KgitWH21/text-fight-2` through the GitHub connector.)
2. Extract `text-fight-pages.zip`. In GitHub choose **Add file → Upload files**. Upload **all extracted contents**, including `data/` and `icons/`, to the repository's `main` branch root. Commit the upload.
3. In **Settings → Pages**, select **Deploy from a branch**, **main**, **/(root)**, then **Save**.
4. Wait for the Pages deployment to finish. The expected URL for that exact account and repository name is `https://kgitwh21.github.io/text-fight-2/`. This is an expected URL, not a verified live deployment from this session.

For ongoing development, push this complete source tree to your repository instead. The included `.github/workflows/pages.yml` tests and builds `dist/`; choose **GitHub Actions** as the Pages source and run **Deploy Text Fight to GitHub Pages**. There are no runtime dependencies or secrets to configure. All asset, manifest, and service-worker URLs are relative and support a repository subpath.

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

The shell, icons, and both decks are cached after the first successful online visit. Future workers wait for **Settings → Update app & resume draft**; updates save first and never clear manuscript storage. This browser behavior still requires real-browser verification in the environment described in TESTING.md.

## Optional live Wordnik draws

The local vocabulary deck is always immediately available. Live Wordnik draws require a password-protected connection. After connecting, words are prefetched in the background; a timeout, network error, malformed response, or HTTP 429 leaves local dealing available. A late response never replaces a card while you are writing.

The app sends your endpoint password over HTTPS to `POST /auth` (or `/word/auth` for an endpoint ending in `/word`). A successful login returns a signed token valid for one hour. Live draws use `GET /` or `/word` with that token in the `Authorization` header, returning `{ "word": "lantern", "definition": "A portable light." }`, or an array of those objects. The app never stores the password or token in local storage, session storage, or cookies. Reloading requires reconnecting. You connect separately on phone and desktop; ordinary offline writing requires no sign-in.

The included `examples/wordnik-worker.js` uses Web Crypto HMAC verification, tokens bound to the app origin, expiry checks, and separate mandatory login/draw rate limits. Authentication is checked before reading the word cache or calling Wordnik. Missing secrets or rate-limit bindings return 503; there is no public fallback. Changing either the endpoint password or signing key invalidates all existing tokens. Disconnecting in the app forgets that tab's token; an intercepted token remains usable until expiry or server-side secret rotation.

To deploy using your Cloudflare Workers account, run these commands **in your own terminal**, from this repo:

```sh
cd examples
# ALLOWED_ORIGIN already permits http://localhost:4173 and
# https://kgitwh21.github.io. Add other exact origins as comma-separated
# values in wrangler.jsonc, without paths or trailing slashes.
npx wrangler login
npx wrangler deploy
# This safely returns 503 until all secrets are configured.

# Skip this command if your Wordnik key is already configured.
npx wrangler secret put WORDNIK_API_KEY

# Choose a unique endpoint password of at least 16 characters.
# Enter it only at the terminal prompt, never in source files or chat.
npx wrangler secret put WORDNIK_ACCESS_PASSWORD

# Generate and upload a random signing key without displaying or saving it.
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put SESSION_SIGNING_KEY
```

The supplied `wrangler.jsonc` permits both `http://localhost:4173` and `https://kgitwh21.github.io`. `ALLOWED_ORIGIN` accepts comma-separated exact origins; each response permits only the matched requesting origin, and a token issued to one origin cannot be used from the other. The Worker still requires HTTPS, including when the app itself is opened on localhost.

It configures five login attempts per minute per IP and 20 draws per minute per IP. Use distinct rate-limit namespace IDs if those IDs are already used by another Worker in your Cloudflare account. Cloudflare's counters are approximate and local to each network location; these controls do not enforce an exact global Wordnik quota. Neither the rate limits nor the origin allowlist replaces authentication.

Copy the deployed **Worker URL**, never the API key, into **Settings → Optional Wordnik endpoint**. Select **Connect Wordnik**, check the displayed host, and enter the endpoint password you chose. Use the updated static app (version 1.1.0 or later); an older app cannot authenticate to this endpoint. Refresh or use **Settings → Update app & resume draft** after updating hosted files.

If sign-in returns **503 / Word service not configured**, the response's `missing` list names missing or invalid settings without returning their values. App version 1.1.1 displays those names in the connection dialog. Check the exact secret names, a 16–256-character endpoint password, a generated 43-character signing key, and both rate-limit bindings from `wrangler.jsonc`. A 503 from a word draw after successful sign-in can instead indicate a Wordnik upstream failure.

An **OPTIONS / 204** preflight is successful and separate from the actual word request. For a failing GET, inspect its JSON response: `WORDNIK_UPSTREAM_ERROR` includes the numeric `upstreamStatus` returned by Wordnik; `WORDNIK_TIMEOUT`, `WORDNIK_NETWORK_ERROR`, `WORDNIK_INVALID_RESPONSE`, and `WORDNIK_INVALID_WORD` distinguish other failures. `WORD_SERVICE_ERROR` includes the failing Worker stage. Diagnostics never forward raw upstream response bodies, exception messages, URLs, or credentials. These Worker-only diagnostic changes require redeploying the Worker; the static app need not be updated for the new JSON fields to appear in Network → Response.

The Worker is excluded from `dist/`; deploy it separately from the static site. Its three secrets belong in Cloudflare's secret store, rather than Wrangler `vars`, frontend build variables, or browser storage. The example draws a word using Wordnik's random-word endpoint and supplies a generic writing instruction rather than making a second request for dictionary definitions. Requires a Wordnik API plan supporting that request. No live API key or user password was used or requested during development.

References: [Cloudflare secret storage](https://developers.cloudflare.com/workers/configuration/secrets/), [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/), [rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Wordnik getting started](https://developer.wordnik.com/gettingstarted).

## Tests and build

```sh
npm test                 # Core, persistence model, manifest, and mocked SW cache tests
npm run build            # Dependency-free static packaging to dist/

# Optional development-only interaction and rendered-browser tests:
npm install --no-save jsdom playwright
npm run test:dom
npx playwright install chromium
npm run test:browser
```

The browser suite targets a 412×915 mobile viewport and a 1440×1000 desktop viewport under `/text-fight-2/`, plus a shortened mobile viewport to approximate keyboard space. Browser emulation does not verify physical Pixel hardware, Android keyboards/dictation, actual installation, or phone mirroring. See [TESTING.md](TESTING.md) for the tests actually completed and environment limitations.
