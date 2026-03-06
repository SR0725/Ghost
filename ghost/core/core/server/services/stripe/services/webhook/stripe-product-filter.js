const _ = require('lodash');
const logging = require('@tryghost/logging');

/**
 * Extracts the Stripe product ID from a subscription object.
 * Handles both expanded and non-expanded subscription formats.
 * @param {object} subscription - A Stripe subscription object
 * @returns {string|null} The Stripe product ID or null
 */
function getProductIdFromSubscription(subscription) {
    return _.get(subscription, 'items.data[0].price.product') || _.get(subscription, 'plan.product') || null;
}

/**
 * Checks whether a given Stripe product ID is allowed by the
 * GHOST_STRIPE_PRODUCT_IDS environment variable whitelist.
 *
 * If the env var is NOT set, all products are allowed (backwards compatible).
 * If the env var IS set, only product IDs in the comma-separated list pass.
 *
 * @param {string} stripeProductId - The Stripe product ID to check
 * @returns {boolean} true if allowed, false if blocked
 */
function isAllowedStripeProduct(stripeProductId) {
    const allowedRaw = process.env.GHOST_STRIPE_PRODUCT_IDS;
    if (!allowedRaw) {
        // Env var not set — no filtering, allow everything (backwards compatible)
        return true;
    }

    const allowedIds = allowedRaw.split(',').map(id => id.trim()).filter(Boolean);
    if (allowedIds.length === 0) {
        return true;
    }

    const allowed = allowedIds.includes(stripeProductId);
    if (!allowed) {
        logging.info(`[stripe-product-filter] Blocked Stripe product ${stripeProductId} — not in GHOST_STRIPE_PRODUCT_IDS whitelist`);
    }
    return allowed;
}

module.exports = {
    getProductIdFromSubscription,
    isAllowedStripeProduct
};
