const logging = require('@tryghost/logging');
const {compact} = require('./identity');
const {getSettings} = require('./settings');
const {getEventSourceUrl} = require('./url');
const {claimEvent} = require('./idempotency');

const GRAPH_VERSION = 'v20.0';

async function capture({eventName, eventId, eventSourceUrl, userData = {}, customData = {}}) {
    const {accessToken, pixelId, testEventCode} = getSettings();
    if (!accessToken || !pixelId || !eventName) {
        return;
    }

    // Server-side idempotency：Stripe webhook 會重試、同一筆交易可能多 endpoint 觸發。
    // claim key 帶 eventName 前綴，因為 Purchase / Subscribe 共用同一個 meta_event_id。
    if (eventId) {
        const claimed = await claimEvent(`${eventName}:${eventId}`);
        if (!claimed) {
            return;
        }
    }

    const payload = compact({
        data: [{
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: eventId,
            event_source_url: getEventSourceUrl(eventSourceUrl),
            action_source: 'website',
            user_data: userData,
            custom_data: compact(customData)
        }],
        test_event_code: testEventCode
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;

    await global.fetch(url, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
        signal: controller.signal
    }).then(async (res) => {
        if (!res.ok) {
            const body = await res.text();
            logging.warn(`Meta CAPI capture failed for "${eventName}": ${res.status} ${body.slice(0, 300)}`);
        } else {
            logging.info(`Meta CAPI "${eventName}" sent (event_id: ${eventId})`);
        }
    }).catch(err => logging.warn(`Meta CAPI capture failed for "${eventName}": ${err.message}`)).finally(() => clearTimeout(timeout));
}

module.exports = {capture};
