#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {createRequire} = require('module');

const rootDir = path.resolve(__dirname, '..');
const requireFromCore = createRequire(path.join(rootDir, 'ghost/core/package.json'));
const mysql = requireFromCore('mysql2/promise');

const DEFAULT_START_SLUG = 'qian-yan-zhe-ge-xi-lie-de-qi-dian';
const DEFAULT_SITE_URL = 'https://blog.ray-realms.com';
const DEFAULT_LOGO_URL = 'https://course.ray-realms.com/icon.png';
const DEFAULT_ENV_FILES = [
    path.join(rootDir, '.env'),
    '/Users/sr0725/Desktop/personal-system/.env'
];
const DEFAULT_STATE_FILE = path.join(rootDir, 'ghost/core/content/data/weekly-newsletter-state.json');

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match) {
            continue;
        }

        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
            value = value.slice(1, -1);
        }

        if (!Object.prototype.hasOwnProperty.call(process.env, match[1])) {
            process.env[match[1]] = value;
        }
    }
}

function parseArgs(argv) {
    const args = {
        dryRun: true,
        markSent: false,
        testTo: null,
        envFiles: [...DEFAULT_ENV_FILES],
        stateFile: process.env.WEEKLY_NEWSLETTER_STATE_FILE || DEFAULT_STATE_FILE
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--send') {
            args.dryRun = false;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--mark-sent') {
            args.markSent = true;
        } else if (arg === '--test-to') {
            args.testTo = argv[++i];
            args.dryRun = false;
        } else if (arg === '--env-file') {
            args.envFiles.push(path.resolve(argv[++i]));
        } else if (arg === '--state-file') {
            args.stateFile = path.resolve(argv[++i]);
        } else if (arg === '--help') {
            printHelp();
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return args;
}

function printHelp() {
    console.log(`Usage: pnpm exec node scripts/weekly-ghost-newsletter.js [options]

Options:
  --dry-run              Preview the window, posts, and recipient count without sending. Default.
  --send                 Send to all newsletter subscribers.
  --test-to <email>      Send the current newsletter template to one email only.
  --mark-sent            Persist the newsletter window after a successful send.
  --env-file <path>      Load an additional dotenv file.
  --state-file <path>    Override the last-sent state file.
`);
}

function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}

function readState(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeState(filePath, state) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripHtml(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(value, length) {
    if (!value || value.length <= length) {
        return value || '';
    }

    return `${value.slice(0, length - 1).trim()}...`;
}

function normalizeSiteUrl(url) {
    return String(url || DEFAULT_SITE_URL).replace(/\/$/, '');
}

function postUrl(siteUrl, post) {
    return `${normalizeSiteUrl(siteUrl)}/${post.slug}/`;
}

function formatDate(date) {
    return new Intl.DateTimeFormat('zh-TW', {
        timeZone: process.env.WEEKLY_NEWSLETTER_TIMEZONE || 'Asia/Taipei',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(new Date(date));
}

function getExcerpt(post) {
    return truncate(post.custom_excerpt || post.plaintext || stripHtml(post.html), 180);
}

function buildEmail({posts, siteUrl, logoUrl, windowStart, windowEnd}) {
    const title = posts.length === 1 ? posts[0].title : `本週更新 ${posts.length} 篇文章`;
    const subject = `Ray Realms｜${title}`;
    const postCards = posts.map((post) => {
        const url = postUrl(siteUrl, post);
        const image = post.feature_image ? `
            <a href="${escapeHtml(url)}" style="display:block;margin:0 0 18px;text-decoration:none;">
                <img src="${escapeHtml(post.feature_image)}" alt="" style="display:block;width:100%;max-height:310px;object-fit:cover;border-radius:14px;border:0;">
            </a>` : '';
        const excerpt = getExcerpt(post);

        return `
            <article style="margin:0 0 18px;padding:20px;border:1px solid #e4e2dd;border-radius:16px;background:#ffffff;">
                ${image}
                <div style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#908b84;">${escapeHtml(formatDate(post.published_at))}</div>
                <h2 style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;font-size:21px;line-height:1.38;color:#222222;font-weight:800;">
                    <a href="${escapeHtml(url)}" style="color:#222222;text-decoration:none;">${escapeHtml(post.title)}</a>
                </h2>
                ${excerpt ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:#5f5b56;">${escapeHtml(excerpt)}</p>` : ''}
                <a href="${escapeHtml(url)}" style="display:inline-block;color:#222222;font-size:14px;font-weight:800;text-decoration:none;">閱讀全文 →</a>
            </article>
        `;
    }).join('\n');

    const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f3;">
  <div style="display:none;max-height:0;overflow:hidden;">整理從 ${escapeHtml(formatDate(windowStart))} 到 ${escapeHtml(formatDate(windowEnd))} 的 Ray Realms 新文章。</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f3;">
    <tr>
      <td align="center" style="padding:30px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:18px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:44px 32px 24px;">
              <a href="${escapeHtml(normalizeSiteUrl(siteUrl))}" style="display:inline-block;text-decoration:none;">
                <img src="${escapeHtml(logoUrl)}" alt="Ray Realms" width="74" height="74" style="display:block;width:74px;height:74px;border-radius:18px;border:0;">
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px;">
              <p style="margin:0 0 20px;font-size:16px;line-height:1.8;color:#222222;font-weight:700;">嗨，Ray Realms 的朋友</p>
              <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans TC','PingFang TC','Microsoft JhengHei',Arial,sans-serif;font-size:25px;line-height:1.35;color:#222222;font-weight:900;">${escapeHtml(title)}</h1>
              <p style="margin:0;font-size:15px;line-height:1.85;color:#5f5b56;">這封信整理了最近新發佈的公開文章。你可以從下方直接回到部落格閱讀完整內容。</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 8px;">
              ${postCards}
            </td>
          </tr>
          <tr>
            <td style="padding:22px 32px 36px;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.8;color:#8a8580;">你收到這封信，是因為你訂閱了 Ray Realms。</p>
              <p style="margin:0;font-size:13px;line-height:1.8;color:#8a8580;"><a href="${escapeHtml(normalizeSiteUrl(siteUrl))}" style="color:#222222;font-weight:800;text-decoration:none;">回到 blog.ray-realms.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = [
        `Ray Realms｜${title}`,
        '',
        `期間：${formatDate(windowStart)} - ${formatDate(windowEnd)}`,
        '',
        ...posts.flatMap((post) => [
            post.title,
            getExcerpt(post),
            postUrl(siteUrl, post),
            ''
        ])
    ].join('\n');

    return {subject, html, text};
}

async function createDb() {
    return mysql.createConnection({
        host: requireEnv('MYSQL_HOST'),
        port: Number(process.env.MYSQL_PORT || 3306),
        user: requireEnv('MYSQL_USER'),
        password: requireEnv('MYSQL_PASSWORD'),
        database: requireEnv('MYSQL_DATABASE')
    });
}

async function getStartPost(db, slug) {
    const [rows] = await db.execute(
        'SELECT id, title, slug, published_at FROM posts WHERE slug = ? AND type = ? LIMIT 1',
        [slug, 'post']
    );

    if (!rows[0]) {
        throw new Error(`Could not find start post with slug: ${slug}`);
    }

    return rows[0];
}

async function getPosts(db, {since, inclusive, until}) {
    const operator = inclusive ? '>=' : '>';
    const [rows] = await db.execute(
        `SELECT id, title, slug, custom_excerpt, plaintext, html, feature_image, published_at
         FROM posts
         WHERE type = 'post'
           AND status = 'published'
           AND visibility = 'public'
           AND published_at ${operator} ?
           AND published_at <= ?
         ORDER BY published_at ASC, id ASC`,
        [since, until]
    );

    return rows;
}

async function getRecipients(db) {
    const [rows] = await db.execute(
        `SELECT DISTINCT m.email, m.name
         FROM members m
         INNER JOIN members_newsletters mn ON mn.member_id = m.id
         INNER JOIN newsletters n ON n.id = mn.newsletter_id
         WHERE m.email_disabled = 0
           AND m.status IN ('free', 'paid', 'comped', 'gift')
           AND n.status = 'active'
         ORDER BY m.email ASC`
    );

    return rows;
}

function getBatchSize() {
    const value = Number(process.env.WEEKLY_NEWSLETTER_BATCH_SIZE || 100);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
        throw new Error('WEEKLY_NEWSLETTER_BATCH_SIZE must be an integer from 1 to 100.');
    }

    return value;
}

function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function buildBatchIdempotencyKey({posts, batchIndex, recipients}) {
    const newestPost = posts[posts.length - 1];
    const recipientHash = crypto
        .createHash('sha256')
        .update(recipients.map(recipient => recipient.email).join(','))
        .digest('hex')
        .slice(0, 16);

    return `weekly-newsletter-${newestPost.id}-${batchIndex + 1}-${recipientHash}`;
}

async function sendResendBatch({recipients, subject, html, text, idempotencyKey}) {
    const from = process.env.WEEKLY_NEWSLETTER_FROM || 'Ray Realms <newsletter@ray-realms.com>';
    const replyTo = process.env.WEEKLY_NEWSLETTER_REPLY_TO || 'ray948787@gmail.com';
    const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${requireEnv('RESEND_API_KEY')}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
        },
        body: JSON.stringify(recipients.map((recipient) => ({
            from,
            reply_to: replyTo,
            to: [recipient.email],
            subject,
            html,
            text
        })))
    });

    const body = await response.text();
    if (!response.ok) {
        throw new Error(`Resend batch failed: ${response.status} ${body}`);
    }

    const parsed = JSON.parse(body);
    const sent = Array.isArray(parsed.data) ? parsed.data : [];
    if (sent.length !== recipients.length) {
        throw new Error(`Resend batch accepted ${sent.length}/${recipients.length} emails: ${body}`);
    }

    return sent;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    args.envFiles.forEach(loadEnvFile);

    const siteUrl = normalizeSiteUrl(process.env.GHOST_PUBLIC_URL || process.env.GHOST_URL || DEFAULT_SITE_URL);
    const logoUrl = process.env.WEEKLY_NEWSLETTER_LOGO_URL || DEFAULT_LOGO_URL;
    const startSlug = process.env.WEEKLY_NEWSLETTER_START_SLUG || DEFAULT_START_SLUG;
    const state = readState(args.stateFile);
    const now = new Date();
    const until = now.toISOString().slice(0, 19).replace('T', ' ');

    const db = await createDb();
    try {
        const startPost = await getStartPost(db, startSlug);
        const hasPreviousSend = Boolean(state.lastSentAt);
        const sinceDate = hasPreviousSend ? new Date(state.lastSentAt) : new Date(startPost.published_at);
        const since = sinceDate.toISOString().slice(0, 19).replace('T', ' ');
        const posts = await getPosts(db, {since, inclusive: !hasPreviousSend, until});
        const recipients = args.testTo ? [{email: args.testTo, name: 'Test recipient'}] : await getRecipients(db);
        const batchSize = getBatchSize();
        const batchCount = recipients.length ? Math.ceil(recipients.length / batchSize) : 0;

        console.log(JSON.stringify({
            mode: args.dryRun ? 'dry-run' : args.testTo ? 'test' : 'send',
            siteUrl,
            state: {
                stateFile: args.stateFile,
                previousLastSentAt: state.lastSentAt || null,
                nextLastSentAtAfterMarkedSend: posts.length ? new Date(posts[posts.length - 1].published_at).toISOString() : state.lastSentAt || null
            },
            window: {
                since: sinceDate.toISOString(),
                inclusive: !hasPreviousSend,
                until: now.toISOString()
            },
            postCount: posts.length,
            posts: posts.map(post => ({
                title: post.title,
                slug: post.slug,
                published_at: new Date(post.published_at).toISOString()
            })),
            recipientCount: recipients.length,
            resendBatch: {
                batchSize,
                batchCount,
                endpoint: '/emails/batch'
            },
            markSent: args.markSent
        }, null, 2));

        if (!posts.length) {
            return;
        }

        const email = buildEmail({posts, siteUrl, logoUrl, windowStart: sinceDate, windowEnd: now});
        if (args.dryRun) {
            return;
        }

        const recipientBatches = chunkArray(recipients, batchSize);
        const delayMs = Number(process.env.WEEKLY_NEWSLETTER_BATCH_DELAY_MS || process.env.WEEKLY_NEWSLETTER_SEND_DELAY_MS || 300);
        let acceptedCount = 0;
        for (const [batchIndex, batchRecipients] of recipientBatches.entries()) {
            const idempotencyKey = buildBatchIdempotencyKey({posts, batchIndex, recipients: batchRecipients});
            const sent = await sendResendBatch({
                recipients: batchRecipients,
                subject: email.subject,
                html: email.html,
                text: email.text,
                idempotencyKey
            });
            acceptedCount += sent.length;
            console.log(`Sent batch ${batchIndex + 1}/${recipientBatches.length}: ${sent.length} accepted (${acceptedCount}/${recipients.length})`);
            if (batchIndex < recipientBatches.length - 1 && delayMs > 0) {
                await sleep(delayMs);
            }
        }

        if (args.markSent) {
            const lastPost = posts[posts.length - 1];
            writeState(args.stateFile, {
                lastSentAt: new Date(lastPost.published_at).toISOString(),
                lastRunAt: now.toISOString(),
                lastPostId: lastPost.id,
                lastPostSlug: lastPost.slug,
                postCount: posts.length,
                recipientCount: recipients.length
            });
            console.log(`Updated state: ${args.stateFile}`);
        }
    } finally {
        await db.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
