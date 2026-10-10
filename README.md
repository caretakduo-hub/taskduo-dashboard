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
