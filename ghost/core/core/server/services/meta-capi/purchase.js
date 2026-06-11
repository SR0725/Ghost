const {buildUserData} = require('./identity');
const {centsToMajor} = require('./money');

const DEFAULT_CONTENT_NAME = 'AI 一人公司實戰攻略';

function buildPurchaseEvent({session, customer, member, contentName}) {
    const amount = centsToMajor(session.amount_total, session.currency);
    const memberId = member?.id || member?.get?.('id') || null;
    const name = customer?.name || session.customer_details?.name || member?.get?.('name') || null;
    const email = customer?.email || session.customer_details?.email || member?.get?.('email') || null;

    return {
        eventName: 'Purchase',
        eventId: session.metadata?.meta_event_id || session.id,
        eventSourceUrl: session.metadata?.attribution_url || null,
        userData: buildUserData({
            email,
            name,
            externalId: memberId || customer?.id || email,
            fbp: session.metadata?.meta_fbp || null,
            fbc: session.metadata?.meta_fbc || null,
            clientIpAddress: session.metadata?.meta_client_ip || null,
            clientUserAgent: session.metadata?.meta_client_user_agent || null
        }),
        customData: {
            value: amount,
            currency: session.currency ? session.currency.toUpperCase() : null,
            order_id: session.id,
            content_type: 'product',
            content_ids: [session.metadata?.tier_id || session.metadata?.offer].filter(Boolean),
            content_name: contentName || DEFAULT_CONTENT_NAME,
            subscription_id: session.subscription || null,
            status: 'paid',
            utm_source: session.metadata?.utm_source || null,
            utm_medium: session.metadata?.utm_medium || null,
            utm_campaign: session.metadata?.utm_campaign || null,
            utm_content: session.metadata?.utm_content || null,
            utm_term: session.metadata?.utm_term || null
        }
    };
}

// 訂閱開始事件。與 Purchase 共用同一個 meta_event_id：Meta dedup 以
// (event_name, event_id) 為 key，client pixel 在成功頁用同一個 id 發
// Subscribe / Purchase 時各自去重，互不干擾。
function buildSubscribeEvent({session, customer, member, contentName}) {
    const base = buildPurchaseEvent({session, customer, member, contentName});

    return {
        ...base,
        eventName: 'Subscribe',
        customData: {
            ...base.customData,
            status: 'subscribed'
        }
    };
}

// 續費事件（invoice.payment_succeeded，billing_reason 非 subscription_create）。
// event_id 用 invoice id，webhook 重試時天然穩定。
function buildRenewalPurchaseEvent({invoice, member, contentName}) {
    const memberId = member?.id || member?.get?.('id') || null;
    const email = member?.get?.('email') || invoice.customer_email || null;
    const name = member?.get?.('name') || invoice.customer_name || null;

    return {
        eventName: 'Purchase',
        eventId: `renewal_${invoice.id}`,
        eventSourceUrl: null,
        userData: buildUserData({
            email,
            name,
            externalId: memberId || invoice.customer || email
        }),
        customData: {
            value: centsToMajor(invoice.amount_paid, invoice.currency),
            currency: invoice.currency ? invoice.currency.toUpperCase() : null,
            order_id: invoice.id,
            content_type: 'product',
            content_name: contentName || DEFAULT_CONTENT_NAME,
            subscription_id: invoice.subscription || null,
            status: 'renewal'
        }
    };
}

module.exports = {
    buildPurchaseEvent,
    buildSubscribeEvent,
    buildRenewalPurchaseEvent
};
