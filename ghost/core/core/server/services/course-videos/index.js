const crypto = require('crypto');
const errors = require('@tryghost/errors');
const models = require('../../models');
const settingsCache = require('../../../shared/settings-cache');

const ACCESS = {
    PUBLIC: 'public',
    MEMBERS: 'members',
    PAID: 'paid'
};

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

module.exports = {
    ACCESS,
    hasAccess,
    getRequiredAccess,
    getCourseVideoForPostUuid,
    getIframeUrl,
    normalizeYouTubeId
};
