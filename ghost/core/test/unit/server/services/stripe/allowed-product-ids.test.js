const assert = require('assert/strict');

const {
    DEFAULT_ALLOWED_STRIPE_PRODUCT_IDS,
    ENV_VAR_NAME,
    parseAllowedStripeProductIdsFromEnv,
    getConfiguredAllowedStripeProductIds
} = require('../../../../../core/server/services/stripe/allowed-product-ids');

describe('allowed-product-ids', function () {
    afterEach(function () {
        delete process.env[ENV_VAR_NAME];
    });

    it('uses default product ids when env var is missing', function () {
        delete process.env[ENV_VAR_NAME];

        const configuredIds = getConfiguredAllowedStripeProductIds();

        assert.deepEqual([...configuredIds], DEFAULT_ALLOWED_STRIPE_PRODUCT_IDS);
    });

    it('parses comma-separated product ids from env var', function () {
        process.env[ENV_VAR_NAME] = 'prod_a, prod_b,prod_c';

        const configuredIds = getConfiguredAllowedStripeProductIds();

        assert.deepEqual([...configuredIds], ['prod_a', 'prod_b', 'prod_c']);
    });

    it('returns null when parsed env var is empty', function () {
        assert.equal(parseAllowedStripeProductIdsFromEnv(' , , '), null);
    });
});
