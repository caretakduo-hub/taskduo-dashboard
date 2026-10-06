# AI Posting and website collection

The editor creates channel-specific titles, copy, carousel slides, story frames, video scripts, captions, image prompts and production directions. Generate images per slide/frame or as a thumbnail. Uploaded and generated media is stored privately; the draft retains durable storage paths rather than expiring preview URLs. Saved drafts and calendar plans can be reopened and edited without creating duplicates.

## OpenAI

Add `OPENAI_API_KEY` in the TaskDuo Supabase project's Edge Function secrets. Do not place it in HTML, JavaScript, GitHub or chat. Optional secrets: `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL`. Defaults are `gpt-4.1-mini` for copy and `gpt-image-2.5-flare` for images. The key needs API billing and access to those models. The panel reports whether the server has a configured key, and displays provider errors. A configured key alone does not confirm model access or billing.

Deploy `supabase/functions/ai-generate/index.ts` with JWT verification enabled. Apply `ai-posting-schema.sql` once. The backend verifies the user and workspace ownership, keeps the API key server-side, and limits each user to eight requests per minute. The `post-media` bucket is private and each user can access only their own path prefix.

## Video generation

A separate video-generation provider has not been chosen. Until it is connected, generate the script, caption, shot directions and thumbnail in this panel, then upload the finished MP4/WebM. The panel does not represent a script as a finished video.

## Publishing

The existing project has no social account connection records, OAuth application credentials or publishing provider. Publishing and automatic delivery remain explicitly unavailable. “Add to calendar” saves a plan only. To enable automatic publishing, choose a publishing provider or supply platform OAuth applications, connect the user's destination accounts, implement account-specific publish validation and delivery, and add a scheduler with idempotency, retries and status receipts. No post is marked published without a platform receipt.

## Competitor website extraction

Apify Website Content Crawler is the configured collector (`APIFY_API_TOKEN` server secret). The previous function created an Apify run but did not associate `source_id`, import its dataset or update the source. `apify-scrape` now links the run. `apify-sync` retrieves the run, imports successful results and updates source status. It can reconnect the older unlinked run by matching the source URL for the authenticated user. A unique `(source_id, external_id)` index makes repeated imports safe. Dashboard refreshes pending collections while open; “Check results” requests an immediate sync. Social profile collection requires platform-specific actors and is not claimed as supported by the website actor.

## Validation

Syntax checks passed for frontend JavaScript and function TypeScript. Mock workflow checks cover generated copy, preserving a draft on API failure, future-date validation, saving media paths, updating a saved draft without duplication, calendar rendering and reopening, format dimensions and the unavailable publishing state. Live generation and collection verification require a signed-in TaskDuo session; no test posts have been published.
