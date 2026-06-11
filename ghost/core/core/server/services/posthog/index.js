const logging = require('@tryghost/logging');
const config = require('../../../shared/config');

const DEFAULT_HOST = 'https://us.i.posthog.com';

function getSettings() {
    const settings = config.get('posthog') || {};
    return {
        key: settings.key || process.env.POSTHOG_KEY || null,
        host: (settings.host || process.env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, '')
    };
}

// posthog-js stores its state in a cookie named `ph_<projectKey>_posthog`,
// URL-encoded JSON containing `distinct_id`. Reading it server-side lets the
// checkout/payment events attribute to the same person as the client events.
function extractDistinctId(cookieHeader) {
    if (!cookieHeader || typeof cookieHeader !== 'string') {
        return null;
    }
    const pair = cookieHeader.split(';').map(part => part.trim()).find(part => /^ph_.+_posthog=/.test(part));
    if (!pair) {
        return null;
    }
    try {
        const parsed = JSON.parse(decodeURIComponent(pair.slice(pair.indexOf('=') + 1)));
        const distinctId = parsed && parsed.distinct_id;
        return typeof distinctId === 'string' && distinctId.length ? distinctId : null;
    } catch (err) {
        return null;
    }
}

// Fire-and-forget capture via PostHog's HTTP endpoint. Never throws —
// analytics must not break checkout or payment processing.
function capture({distinctId, event, properties = {}}) {
    const {key, host} = getSettings();
    if (!key || !distinctId || !event) {
        return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    global.fetch(`${host}/capture/`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
            api_key: key,
            event,
            distinct_id: distinctId,
            properties: {...properties, $lib: 'ghost-server'},
            timestamp: new Date().toISOString()
        }),
        signal: controller.signal
    }).catch(err => logging.warn(`PostHog capture failed for "${event}": ${err.message}`)).finally(() => clearTimeout(timeout));
}

module.exports = {capture, extractDistinctId};
