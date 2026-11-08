# Verification record — 2026-11-08

## Completed

`npm test`: **32 tests passed**, running the actual core, a simulated service-worker runtime, and the authenticated endpoint with real Web Crypto plus mocked networking/cache:

- Exact 3,000-word baseline → add 120 → correct original `teh` to `the` → session +120, XP 120 → cut 15 → +105 → undo +120 → redo +105 → JSON restoration retains 3,105 full words, +105 session words, and XP 120.
- Grouped native-style undo/redo restores edit provenance without re-awarding XP. New prose after cuts earns XP. Existing drafts earn no opening/restoration XP.
- Middle insertion, replacing selected text, corrected session-copy text, multiword dictation-style input, Unicode counting, case-insensitive whole-word vocabulary detection, and one bonus shared by automatic/manual prompt use.
- Category-first draws, single-category practice, immediate-repeat exclusion, hidden/paused/pinned timer behavior, no backlog, and rank/level thresholds.
- Original Text Fight rank ladder: exact league promotion boundaries, five steps per league, pip counts, progress to the next step, Master entry at 14,320 XP, and Writer Rate bands through Ultimate Master. Current XP earnings and numeric levels remain intact.
- Exact original craft category counts and explanations; all 1,168 local word entries, with case-insensitive uniqueness and a nonempty explanation for every word.
- Relative manifest scope/start URL, real PNG dimensions, local asset existence, repository-subpath resolution.
- Mocked service-worker cache: complete local offline shell, cache isolation from other apps/subpaths, first-install activation, waiting update, explicit update activation, and external endpoint exclusion. This is **not** an actual browser offline reload.
- Authenticated Wordnik endpoint: missing-secret/binding rejection, unauthenticated reads, wrong passwords, forged and tampered tokens, exact expiry, origin binding, credential rotation/revocation, bounded login bodies, separate login/draw throttling, CORS preflight, protected cache hits, upstream HTTP 429/outages, and no password or API key in responses. Token signing/verification uses real Web Crypto in the tests. No real Wordnik request or key was used.
- Multiple allowed origins: localhost and GitHub Pages both pass preflight, login, and authenticated draws using the actual Wrangler configuration. Responses reflect only the exact matched origin. Tokens cannot cross between allowed origins; other ports, lookalike domains, and null/empty origins are rejected.
- Configuration diagnostics name missing/invalid secrets and bindings without returning secret values. The connection dialog displays recognized setting names and requirements, ignores unexpected server details, and keeps local writing available.
- Draw diagnostics preserve numeric Wordnik upstream statuses (400/401/403/404/429/500) and distinguish timeout, network, JSON, invalid-word, and Worker-cache failures. Tests inject secret-bearing exception messages and response bodies and verify none of those secrets appear in diagnostic responses.

`npm run test:dom`: **six interaction scenario groups passed** using jsdom 26.1.0 already available on this host:

- Actual app event handlers for the 3,000-word regression, selection/caret preservation, full and corrected-session clipboard text, plain-text download content, autosave, and app restart using saved local storage.
- Pace changes without changing the card, text, or XP; fractional custom pace; pin/unpin; manual next; pause; duplicate bonus prevention. A simulated clock also exercises automatic deals without changing focus/caret, background exclusion, and no backlog after suspension.
- Draft creation, switching and restoring separate rounds; drill mode; mocked optional-endpoint success, HTTP 429 and offline fallbacks; automatic vocabulary bonus plus repeated manual confirmation and restoration.
- Original rank names, five-pip display, Master ratings, promotion fanfare preserving editor focus, and existing saves restoring without changing XP, drafts, round state, or replaying the promotion fanfare.
- Wordnik connection UI: successful/incorrect/throttled password login, authorization headers with redirects disabled, cleared password fields, no credentials in local/session storage, loss of credentials on reload, disconnect and expiry, denied-request offline fallback, and cancellation ignoring a late login response. Writing, active-round identity, and XP remain intact.
- Mobile fullscreen writing: computed CSS hides all app UI except the editor and prompt/timer with its exit control. Existing selection direction, caret, scrolling, manuscript, baseline, round, and XP are preserved across entry/exit. Timed cards keep changing without stealing focus. Tests cover idle-draft round creation without awarding baseline XP, writing/autosave in the mode, short viewport handling, Escape/IME behavior, and mocked native fullscreen success, browser exit, rejection, and cancellation during an async transition. These are DOM/CSS checks and mocked APIs, rather than rendered or physical-phone verification.

DOM-harness command used:

```sh
JSDOM_PATH=/home/kwhay/keith-projects/text-fight/node_modules/jsdom node tests/dom.cjs
```

`npm run build` passed. JavaScript syntax checks passed. Prompt data was retrieved from the original repository through the GitHub connector; no source repository changes were made.

## Attempted, blocked by the execution environment

- `npm start`: server fails with `listen EPERM` on `127.0.0.1:4173`; the sandbox disallows listening sockets.
- `npm run test:browser`: the HTTP server fails with the same `listen EPERM`. A separate Playwright Chromium launch was also attempted and terminated with `setsockopt: Operation not permitted`.
- Sites source publication: DNS lookup of `git.chatgpt-team.site` fails. A Site identity was reserved, but no source was pushed and no version deployed. The ordinary GitHub CLI credential is unavailable, and the connector returned 404 for `KgitWH21/text-fight-2`.
- Superdesign canvas creation: DNS lookup of `api.superdesign.dev` fails. Interface implemented directly from the user's brief.

## Still needs real-browser/device verification

The executable browser suite is included in `tests/browser.cjs`. Run it on a host allowing a local HTTP server and Chromium. It exercises the regression, focus/caret after deals, pace/pin/pause, clipboard, XP deduplication, persistence, a **real** service-worker offline reload, and layout overflow at **412×915** and **1440×1000**, plus mobile fullscreen at normal height and a **412×430** keyboard-space approximation. It checks that only the prompt/timer/editor/exit control remain visible, the shortened-viewport editor retains useful height, and exiting preserves the draft, round, and XP. These rendered-browser checks did **not** run successfully here; no browser screenshot is claimed.

No physical Pixel 8a, Windows browser, Android dictation/keyboard, install prompt, audio playback, or livestream mirroring was available to test. The authenticated Wordnik endpoint was checked with real cryptography and mocked upstream responses; it was not deployed or tested with a real API key. Actual browser CORS preflight and phone/desktop login remain unverified here; deployment and Cloudflare secret configuration must be completed from the user's terminal.
