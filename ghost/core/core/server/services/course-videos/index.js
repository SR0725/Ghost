/* eslint-disable max-lines */
const crypto = require('crypto');
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const models = require('../../models');
const db = require('../../data/db');
const settingsCache = require('../../../shared/settings-cache');
const urlUtils = require('../../../shared/url-utils');

const ACCESS = {
    PUBLIC: 'public',
    MEMBERS: 'members',
    PAID: 'paid'
};

const EVENT_TYPES = new Set([
    'impression',
    'authorized',
    'unauthorized',
    'play',
    'watch',
    'progress_25',
    'progress_50',
    'progress_75',
    'progress_90',
    'complete',
    'dock',
    'undock',
    'close',
    'cta_view',
    'cta_click',
    'error'
]);

const DEDUPE_EVENT_TYPES = new Set([
    'impression',
    'authorized',
    'unauthorized',
    'play',
    'progress_25',
    'progress_50',
    'progress_75',
    'progress_90',
    'complete',
    'cta_view',
    'cta_click'
]);

const EVENT_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const EVENT_BUDGET_PER_SESSION_PER_VIDEO = 300;
const WATCH_EVENT_MIN_INTERVAL_MS = 20 * 1000;
const EVENT_COOKIE_NAME = 'ghost-course-video-session';
const EVENT_COOKIE_MAX_AGE_SECONDS = 6 * 60 * 60;

function base64url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function normalizeYouTubeId(value) {
    if (!value) {
        return '';
    }

    try {
        const parsed = new URL(value);
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.replace(/^\//, '');
        }
        if (parsed.searchParams.get('v')) {
            return parsed.searchParams.get('v');
        }
        const embedMatch = parsed.pathname.match(/\/embed\/([^/]+)/);
        if (embedMatch) {
            return embedMatch[1];
        }
    } catch (e) {
        // Treat plain values as video IDs.
    }

    return value;
}

function hasAccess(courseVideo, member) {
    if (!courseVideo || !courseVideo.enabled) {
        return false;
    }

    if (courseVideo.access === ACCESS.PUBLIC) {
        return true;
    }

    if (!member) {
        return false;
    }

    if (courseVideo.access === ACCESS.MEMBERS) {
        return true;
    }

    return courseVideo.access === ACCESS.PAID && member.status !== 'free';
}

function getRequiredAccess(courseVideo) {
    return courseVideo?.access || ACCESS.PUBLIC;
}

async function getCourseVideoForPostUuid(postUuid) {
    const post = await models.Post.findOne({uuid: postUuid, status: 'published'}, {withRelated: ['course_video']});

    if (!post) {
        throw new errors.NotFoundError({message: 'Post not found'});
    }

    const courseVideo = post.related('course_video');

    if (!courseVideo || !courseVideo.get('id')) {
        throw new errors.NotFoundError({message: 'Course video not found'});
    }

    return courseVideo.toJSON();
}

function getCloudflareCustomerCode() {
    return settingsCache.get('course_video_cloudflare_customer_code');
}

function createCloudflareToken(videoUID) {
    const keyID = settingsCache.get('course_video_cloudflare_signing_key_id');
    const jwkRaw = settingsCache.get('course_video_cloudflare_signing_key_jwk');

    if (!keyID || !jwkRaw) {
        return null;
    }

    let jwk;
    try {
        jwk = JSON.parse(jwkRaw);
    } catch (e) {
        jwk = JSON.parse(Buffer.from(jwkRaw, 'base64').toString('utf8'));
    }

    const privateKey = crypto.createPrivateKey({
        key: jwk,
        format: 'jwk'
    });
    const now = Math.floor(Date.now() / 1000);
    const header = {
        alg: 'RS256',
        kid: keyID
    };
    const payload = {
        sub: videoUID,
        kid: keyID,
        nbf: now - 30,
        exp: now + 60 * 60
    };
    const token = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(token);
    signer.end();
    const signature = signer.sign(privateKey);

    return `${token}.${base64url(signature)}`;
}

async function createCloudflareTokenFromAPI(videoUID) {
    const accountID = settingsCache.get('course_video_cloudflare_account_id');
    const apiToken = settingsCache.get('course_video_cloudflare_api_token');

    if (!accountID || !apiToken) {
        throw new errors.InternalServerError({
            message: 'Cloudflare Stream is not configured'
        });
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountID}/stream/${videoUID}/token`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiToken}`,
            'content-type': 'application/json'
        }
    });
    const data = await response.json();

    if (!response.ok || !data.success || !data.result?.token) {
        throw new errors.InternalServerError({
            message: 'Could not create Cloudflare Stream token'
        });
    }

    return data.result.token;
}

async function assertCloudflareSignedUrlsRequired(videoUID) {
    const accountID = settingsCache.get('course_video_cloudflare_account_id');
    const apiToken = settingsCache.get('course_video_cloudflare_api_token');

    if (!accountID || !apiToken) {
        return;
    }

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountID}/stream/${videoUID}`, {
        headers: {
            Authorization: `Bearer ${apiToken}`
        }
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new errors.InternalServerError({
            message: 'Could not verify Cloudflare Stream signed URL requirement'
        });
    }

    if (data.result?.requireSignedURLs === false) {
        throw new errors.InternalServerError({
            message: 'Cloudflare Stream video must require signed URLs for restricted course video access'
        });
    }
}

async function getCloudflareIframeUrl(courseVideo) {
    const customerCode = getCloudflareCustomerCode();

    if (!customerCode) {
        throw new errors.InternalServerError({
            message: 'Cloudflare Stream customer code is not configured'
        });
    }

    let videoIdentifier = courseVideo.provider_video_id;

    if (courseVideo.access !== ACCESS.PUBLIC) {
        await assertCloudflareSignedUrlsRequired(courseVideo.provider_video_id);

        let localToken = null;
        try {
            localToken = createCloudflareToken(courseVideo.provider_video_id);
        } catch (e) {
            localToken = null;
        }
        videoIdentifier = localToken || await createCloudflareTokenFromAPI(courseVideo.provider_video_id);
    }

    return `https://customer-${customerCode}.cloudflarestream.com/${videoIdentifier}/iframe`;
}

async function getIframeUrl(courseVideo) {
    if (!courseVideo.provider_video_id) {
        throw new errors.BadRequestError({
            message: 'Course video is missing a provider video ID'
        });
    }

    if (courseVideo.provider === 'youtube') {
        return `https://www.youtube.com/embed/${normalizeYouTubeId(courseVideo.provider_video_id)}`;
    }

    if (courseVideo.provider === 'cloudflare_stream') {
        return getCloudflareIframeUrl(courseVideo);
    }

    throw new errors.BadRequestError({
        message: 'Unsupported course video provider'
    });
}

function clampInteger(value, min, max) {
    const number = Number.parseInt(value, 10);

    if (!Number.isFinite(number)) {
        return null;
    }

    return Math.min(Math.max(number, min), max);
}

function getEventSigningSecret() {
    return settingsCache.get('theme_session_secret') || settingsCache.get('db_hash');
}

function signSessionSeed(seed) {
    return crypto
        .createHmac('sha256', getEventSigningSecret())
        .update(seed)
        .digest('base64url');
}

function createBrowserSessionCookieValue() {
    const seed = crypto.randomBytes(24).toString('base64url');
    return `${seed}.${signSessionSeed(seed)}`;
}

function parseCookies(header = '') {
    return header.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index === -1) {
            return cookies;
        }

        const name = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (name) {
            cookies[name] = decodeURIComponent(value);
        }
        return cookies;
    }, {});
}

function getBrowserSessionFromRequest(req) {
    const value = parseCookies(req.headers.cookie || '')[EVENT_COOKIE_NAME];
    if (!value) {
        return null;
    }

    const parts = value.split('.');
    if (parts.length !== 2) {
        return null;
    }

    const [seed, signature] = parts;
    const expected = signSessionSeed(seed);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);

    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return null;
    }

    return seed;
}

function ensureBrowserSessionCookie(req, res) {
    const existing = getBrowserSessionFromRequest(req);
    if (existing) {
        return existing;
    }

    const value = createBrowserSessionCookieValue();
    const cookiePath = urlUtils.getSubdir() || '/';
    const secure = urlUtils.isSSL(urlUtils.getSiteUrl()) ? ' Secure;' : '';
    const cookie = `${EVENT_COOKIE_NAME}=${encodeURIComponent(value)}; Max-Age=${EVENT_COOKIE_MAX_AGE_SECONDS}; Path=${cookiePath}; HttpOnly; SameSite=Lax;${secure}`;
    const existingCookies = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [cookie].concat(existingCookies));

    return null;
}

function getDateBucket(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function signEventTokenValue(value) {
    return crypto
        .createHmac('sha256', getEventSigningSecret())
        .update(value)
        .digest('base64url');
}

function createEventToken(courseVideo, sessionId, browserSession) {
    const expires = Math.floor(Date.now() / 1000) + EVENT_TOKEN_TTL_SECONDS;
    const browserSessionHash = signSessionSeed(browserSession);
    const payload = `${courseVideo.id}.${courseVideo.post_id}.${sessionId}.${browserSessionHash}.${expires}`;
    return `${payload}.${signEventTokenValue(payload)}`;
}

function verifyEventToken(courseVideo, sessionId, token, browserSession) {
    if (typeof token !== 'string') {
        return false;
    }

    const parts = token.split('.');
    if (parts.length !== 6) {
        return false;
    }

    const [courseVideoId, postId, tokenSessionId, browserSessionHash, expiresRaw, signature] = parts;
    const expires = Number.parseInt(expiresRaw, 10);

    if (
        courseVideoId !== courseVideo.id ||
        postId !== courseVideo.post_id ||
        tokenSessionId !== sessionId ||
        browserSessionHash !== signSessionSeed(browserSession) ||
        !Number.isFinite(expires) ||
        expires < Math.floor(Date.now() / 1000)
    ) {
        return false;
    }

    const payload = `${courseVideoId}.${postId}.${tokenSessionId}.${browserSessionHash}.${expiresRaw}`;
    const expected = signEventTokenValue(payload);
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);

    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function hashSessionId(sessionId, browserSession, date = new Date()) {
    return crypto
        .createHmac('sha256', getEventSigningSecret())
        .update(`${getDateBucket(date)}:${browserSession}:${sessionId}`)
        .digest('hex')
        .slice(0, 64);
}

function getMemberStatusBucket(member) {
    if (!member) {
        return 'anonymous';
    }

    if (['free', 'paid', 'comped', 'gift'].includes(member.status)) {
        return member.status;
    }

    return 'member';
}

function normalizeSessionId(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const sessionId = value.trim();

    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(sessionId)) {
        return null;
    }

    return sessionId;
}

function normalizeEventToken(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeEventPayload(payload = {}) {
    const eventType = typeof payload.event_type === 'string' ? payload.event_type.trim() : '';

    if (!EVENT_TYPES.has(eventType)) {
        throw new errors.BadRequestError({message: 'Unsupported course video event type'});
    }

    const sessionId = normalizeSessionId(payload.session_id);

    if (!sessionId) {
        throw new errors.BadRequestError({message: 'Invalid course video session id'});
    }

    const metadata = {};
    if (typeof payload.docked === 'boolean') {
        metadata.docked = payload.docked;
    }
    if (typeof payload.reason === 'string') {
        metadata.reason = payload.reason.slice(0, 80);
    }

    return {
        event_type: eventType,
        session_id: sessionId,
        event_token: normalizeEventToken(payload.event_token),
        playback_position_seconds: clampInteger(payload.playback_position_seconds, 0, 24 * 60 * 60),
        duration_seconds: clampInteger(payload.duration_seconds, 0, 24 * 60 * 60),
        watch_seconds: clampInteger(payload.watch_seconds, 0, 10 * 60),
        progress_percent: clampInteger(payload.progress_percent, 0, 100),
        metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : null
    };
}

function getCourseVideoEventToken(courseVideo, sessionId, browserSession) {
    const normalizedSessionId = normalizeSessionId(sessionId);

    if (!normalizedSessionId) {
        throw new errors.BadRequestError({message: 'Invalid course video session id'});
    }

    if (!browserSession) {
        throw new errors.BadRequestError({message: 'Missing course video browser session'});
    }

    return createEventToken(courseVideo, normalizedSessionId, browserSession);
}

async function recordEventForPostUuid(postUuid, member, payload, browserSession) {
    const courseVideo = await getCourseVideoForPostUuid(postUuid);
    const event = normalizeEventPayload(payload);
    const canAccess = hasAccess(courseVideo, member);
    const now = new Date();
    const sessionHash = hashSessionId(event.session_id, browserSession, now);

    if (!browserSession || !verifyEventToken(courseVideo, event.session_id, event.event_token, browserSession)) {
        throw new errors.NoPermissionError({message: 'Invalid course video event token.'});
    }

    if (!canAccess && !['impression', 'unauthorized', 'cta_view', 'cta_click', 'error'].includes(event.event_type)) {
        throw new errors.NoPermissionError({message: 'You do not have access to this course video.'});
    }

    const row = {
        id: ObjectId().toHexString(),
        post_id: courseVideo.post_id,
        post_course_video_id: courseVideo.id,
        session_id: sessionHash,
        member_status: getMemberStatusBucket(member),
        event_type: event.event_type,
        provider: courseVideo.provider,
        access: courseVideo.access,
        playback_position_seconds: event.playback_position_seconds,
        duration_seconds: event.duration_seconds,
        watch_seconds: event.watch_seconds,
        progress_percent: event.progress_percent,
        metadata: event.metadata,
        created_at: now
    };

    const eventBudgetWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const eventCountResult = await db.knex('course_video_events')
        .where({
            post_course_video_id: row.post_course_video_id,
            session_id: row.session_id
        })
        .where('created_at', '>=', eventBudgetWindow)
        .count({count: 'id'})
        .first();

    if (toNumber(eventCountResult?.count) >= EVENT_BUDGET_PER_SESSION_PER_VIDEO) {
        return {created: false};
    }

    if (row.event_type === 'watch') {
        const recentWatch = await db.knex('course_video_events')
            .select('id')
            .where({
                post_course_video_id: row.post_course_video_id,
                session_id: row.session_id,
                event_type: row.event_type
            })
            .where('created_at', '>=', new Date(Date.now() - WATCH_EVENT_MIN_INTERVAL_MS))
            .first();

        if (recentWatch) {
            return {created: false};
        }
    }

    if (DEDUPE_EVENT_TYPES.has(row.event_type)) {
        const duplicateWindow = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existing = await db.knex('course_video_events')
            .select('id')
            .where({
                post_course_video_id: row.post_course_video_id,
                session_id: row.session_id,
                event_type: row.event_type
            })
            .where('created_at', '>=', duplicateWindow)
            .first();

        if (existing) {
            return {created: false};
        }
    }

    await db.knex('course_video_events').insert(row);

    return {created: true};
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

async function getAnalytics(options = {}) {
    const query = db.knex('course_video_events as cve')
        .leftJoin('posts as p', 'p.id', 'cve.post_id')
        .leftJoin('post_course_videos as pcv', 'pcv.id', 'cve.post_course_video_id')
        .select('cve.post_id')
        .select('p.uuid as post_uuid')
        .select('p.title as post_title')
        .select('p.slug as post_slug')
        .select('cve.post_course_video_id')
        .select('pcv.title as video_title')
        .select('cve.provider')
        .select('cve.access')
        .countDistinct({viewers: 'cve.session_id'})
        .count({events: 'cve.id'})
        .sum({watch_seconds: 'cve.watch_seconds'})
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as impressions', ['impression']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as plays', ['play']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as completions', ['complete']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as progress_25', ['progress_25']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as progress_50', ['progress_50']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as progress_75', ['progress_75']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as progress_90', ['progress_90']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as docks', ['dock']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as closes', ['close']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as cta_views', ['cta_view']))
        .select(db.knex.raw('SUM(CASE WHEN cve.event_type = ? THEN 1 ELSE 0 END) as cta_clicks', ['cta_click']))
        .groupBy('cve.post_id', 'p.uuid', 'p.title', 'p.slug', 'cve.post_course_video_id', 'pcv.title', 'cve.provider', 'cve.access')
        .orderBy('watch_seconds', 'desc')
        .limit(clampInteger(options.limit, 1, 100) || 20);

    if (options.post_uuid) {
        query.where('p.uuid', options.post_uuid);
    }

    if (options.post_id) {
        query.where('cve.post_id', options.post_id);
    }

    const rows = await query;

    return {
        data: rows.map((row) => {
            const plays = toNumber(row.plays);
            const completions = toNumber(row.completions);
            const viewers = toNumber(row.viewers);
            const watchSeconds = toNumber(row.watch_seconds);

            return {
                ...row,
                viewers,
                events: toNumber(row.events),
                watch_seconds: watchSeconds,
                impressions: toNumber(row.impressions),
                plays,
                completions,
                completion_rate: plays ? completions / plays : 0,
                average_watch_seconds: viewers ? watchSeconds / viewers : 0,
                progress_25: toNumber(row.progress_25),
                progress_50: toNumber(row.progress_50),
                progress_75: toNumber(row.progress_75),
                progress_90: toNumber(row.progress_90),
                docks: toNumber(row.docks),
                closes: toNumber(row.closes),
                cta_views: toNumber(row.cta_views),
                cta_clicks: toNumber(row.cta_clicks)
            };
        })
    };
}

module.exports = {
    ACCESS,
    hasAccess,
    getRequiredAccess,
    getCourseVideoForPostUuid,
    getIframeUrl,
    normalizeYouTubeId,
    ensureBrowserSessionCookie,
    getBrowserSessionFromRequest,
    getCourseVideoEventToken,
    recordEventForPostUuid,
    getAnalytics
};
