# Weekly Ghost newsletter

This local job sends a weekly digest of public Ghost posts to active newsletter subscribers.

## Automation flow

Every scheduled run follows the same loop:

1. Read the last successful send record from:

```text
/Users/sr0725/Desktop/Ghost/ghost/core/content/data/weekly-newsletter-state.json
```

2. If no state file exists yet, start from the configured first post slug:

```text
qian-yan-zhe-ge-xi-lie-de-qi-dian
```

This makes the first real send include "00-前言：這個系列的起點".

3. Query Ghost for public published posts in the window:

```text
previous lastSentAt -> current run time
```

The first run uses an inclusive start so the configured first post is included. Later runs use posts published after the saved `lastSentAt`.

4. Send the email to active newsletter subscribers whose member status is `free`, `paid`, `comped`, or `gift`, excluding members with `email_disabled = true`.

The sender uses Resend's batch endpoint:

```text
POST /emails/batch
```

Each batch sends up to 100 separate email payloads. Each payload still has exactly one recipient in `to`, so member email addresses are not exposed to other subscribers.

5. After a successful full send with `--mark-sent`, update the state file with:

```json
{
  "lastSentAt": "published_at of the newest sent post",
  "lastRunAt": "time this job ran",
  "lastPostId": "newest sent post id",
  "lastPostSlug": "newest sent post slug",
  "postCount": "number of sent posts",
  "recipientCount": "number of accepted recipients"
}
```

This is what makes the system continuously read, send, update, then use the updated record on the next Sunday.

## Commands

Preview the send window, posts, and recipient count:

```bash
pnpm exec node scripts/weekly-ghost-newsletter.js --dry-run
```

Send one test email without updating the last-sent state:

```bash
pnpm exec node scripts/weekly-ghost-newsletter.js --test-to ray948787@gmail.com
```

Send to all active subscribers and persist the last sent post timestamp:

```bash
pnpm exec node scripts/weekly-ghost-newsletter.js --send --mark-sent
```

## Schedule

The production schedule is handled by Codex automation:

```text
automation id: ghost-weekly-newsletter
local time: every Sunday at 21:00 Asia/Taipei
rrule: FREQ=WEEKLY;BYDAY=SU;BYHOUR=13;BYMINUTE=0;BYSECOND=0
```

Codex automation stores this schedule in UTC. `13:00 UTC` is `21:00` in Taiwan.

The old macOS crontab entry is intentionally disabled to prevent duplicate sends:

```cron
# Disabled; handled by Codex automation: 0 21 * * 0 cd /Users/sr0725/Desktop/Ghost && /usr/local/bin/pnpm exec node scripts/weekly-ghost-newsletter.js --send --mark-sent >> /Users/sr0725/Desktop/Ghost/ghost/core/content/logs/weekly-newsletter.log 2>&1
```

## State

The job stores its last-sent state at:

```text
/Users/sr0725/Desktop/Ghost/ghost/core/content/data/weekly-newsletter-state.json
```

On the first successful full send, the window starts from the post slug:

```text
qian-yan-zhe-ge-xi-lie-de-qi-dian
```

That makes the first newsletter include the article "00-前言：這個系列的起點". Later sends only include posts published after the saved `lastSentAt`.

The cron job uses `--send --mark-sent`, so it sends first and only updates this file after Resend accepts every recipient email.

The send uses Resend batch requests. If any batch request fails or returns fewer accepted email IDs than expected, the script exits without updating `lastSentAt`.

## Environment

The script loads:

```text
/Users/sr0725/Desktop/Ghost/.env
/Users/sr0725/Desktop/personal-system/.env
```

Required values:

```text
MYSQL_HOST
MYSQL_PORT
MYSQL_USER
MYSQL_PASSWORD
MYSQL_DATABASE
RESEND_API_KEY
```

Optional overrides:

```text
GHOST_PUBLIC_URL=https://blog.ray-realms.com
WEEKLY_NEWSLETTER_FROM="Ray Realms <newsletter@ray-realms.com>"
WEEKLY_NEWSLETTER_LOGO_URL=https://course.ray-realms.com/icon.png
WEEKLY_NEWSLETTER_REPLY_TO=ray948787@gmail.com
WEEKLY_NEWSLETTER_BATCH_SIZE=100
WEEKLY_NEWSLETTER_BATCH_DELAY_MS=300
WEEKLY_NEWSLETTER_STATE_FILE=/absolute/path/to/state.json
```
