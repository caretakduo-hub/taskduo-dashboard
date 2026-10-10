# TaskDuo Intelligence Dashboard

Standalone authenticated intelligence workspace for TaskDuo.

## Pages
- login.html — Supabase sign in/sign up
- dashboard.html — protected intelligence workspace

## Modules
Web Scraper, Traffic Intelligence, Social Media Management, Content Intelligence, Data Sources, Content Calendar and Settings.

## Deployment
Static files; deploy as a separate Vercel project. Configure the TaskDuo Supabase URL and publishable/anon key in the HTML files. Live scraping, analytics ingestion and social publishing require server-side integrations.

## Creative intelligence workspace

The dashboard now includes Posting Intelligence, Data Quality & AI, Content Ideas, AD Intelligence and Social Media Management. The former AI Intelligence navigation and module are removed.

Posting reports use actual publication timestamps and available engagement fields in IST. Missing metrics display as unavailable. Source quality and opportunity cards use collected evidence. Content Ideas supports saved brand context, channel-specific copy and images, carousel/story frames, uploaded video, AI/manual voiceovers, previews and approval. AD Intelligence creates editable copy packages and images for Telegram, Meta and Google; it does not launch paid campaigns. Social Management creates durable day/week/month briefs with content mix and verified event context, then hands off to the editor, approval and calendar.

Apply `intelligence-schema.sql` and deploy the updated `ai-generate` and `access-management` functions. Existing OpenAI secrets are reused; speech uses gpt-4o-mini-tts. Audio is stored privately in post-media, with persisted storage paths rather than expiring signed URLs. New section permissions are available in Access Management; existing aiintel grants migrate to Content Ideas only.

Schedules use Asia/Kolkata. Adding to the calendar records a schedule; automatic delivery still requires a publishing provider supporting that channel/format. Existing Buffer integration supports its configured Instagram image destination. Finished-video generation requires a separate provider. Website-link generation can use extracted source evidence but does not claim to have read an uncollected website.

Validation: `node tests/intelligence.test.cjs`, syntax checks for frontend scripts and both Edge Functions, and deployment checks.


## fal.ai video generation

Apply `fal-video-schema.sql` and deploy ai-generate with both `index.ts` and `fal-video.ts`. Set `FAL_KEY` in Supabase Edge Functions → Secrets. The key must remain server-side; do not put it in Vercel's public environment, HTML, Git, or a content brief.

In Content Ideas select Reel, Short or Video, generate or edit the production prompt (maximum 1,500 characters), choose 5/10 seconds and 480p/720p/1080p, then Generate video. Wan 2.5 uses 9:16 for Reels/Shorts, 16:9 for YouTube video, and selectable aspect ratios for other video formats. Each submit consumes fal.ai credits. These are short clips rather than full long-form edits.

Jobs are durably scoped to the submitting user and workspace. Repeated submits with the same ID reuse the job; an active-job index prevents simultaneous paid submissions. Polling and Resume latest retrieve the existing job without starting another generation. Completed MP4s are copied into private post-media storage before preview; the user explicitly attaches the result to a matching draft, then saves/sends for approval. No automatic publication is performed. Voiceovers remain separately attached and are not automatically mixed into generated video.

A submission timeout enters submission_unknown and blocks new generation to avoid duplicate charges. Check fal.ai request history and resolve that job before requesting another. Missing key, credits, provider failures and storage errors are shown explicitly. The integration is not activated or live-tested until a valid funded fal.ai key is set.

Tests: `node tests/fal-video.test.cjs` verifies missing keys, option validation, URL restrictions, idempotency, user isolation, polling and private result persistence using mock responses; no paid generation is used.
