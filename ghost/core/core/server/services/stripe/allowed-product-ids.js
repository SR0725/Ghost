const DEFAULT_ALLOWED_STRIPE_PRODUCT_IDS = [
    // Support (donation)
    'prod_TsmdmhvK4Yn5OQ',
    // Subscription
    'prod_TsdKROExPlhk9k'
];

const ENV_VAR_NAME = 'GHOST_STRIPE_ALLOWED_PRODUCT_IDS';

function parseAllowedStripeProductIdsFromEnv(envValue) {
    if (!envValue || typeof envValue !== 'string') {
        return null;
    }

    const productIds = envValue
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

    if (productIds.length === 0) {
        return null;
    }

    return productIds;
}

function getConfiguredAllowedStripeProductIds() {
    const envProductIds = parseAllowedStripeProductIdsFromEnv(process.env[ENV_VAR_NAME]);
    return new Set(envProductIds || DEFAULT_ALLOWED_STRIPE_PRODUCT_IDS);
}

const ALLOWED_STRIPE_PRODUCT_IDS = getConfiguredAllowedStripeProductIds();

function getStripeProductId(product) {
    if (!product) {
        return null;
    }

    if (typeof product === 'string') {
        return product;
    }

    if (typeof product === 'object' && product.id) {
        return product.id;
    }

    return null;
}

function isAllowedStripeProductId(product) {
    const productId = getStripeProductId(product);
    return !!productId && ALLOWED_STRIPE_PRODUCT_IDS.has(productId);
}

module.exports = {
    ALLOWED_STRIPE_PRODUCT_IDS,
    DEFAULT_ALLOWED_STRIPE_PRODUCT_IDS,
    ENV_VAR_NAME,
    parseAllowedStripeProductIdsFromEnv,
    getConfiguredAllowedStripeProductIds,
    getStripeProductId,
    isAllowedStripeProductId
};
