const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const metaCapiService = require('../../../../core/server/services/meta-capi');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

describe('Meta CAPI service', function () {
    describe('centsToMajor', function () {
        it('does not divide zero-decimal currencies', function () {
            assert.equal(metaCapiService._private.centsToMajor(3000, 'twd'), 3000);
            assert.equal(metaCapiService._private.centsToMajor(500, 'JPY'), 500);
        });

        it('divides decimal currencies', function () {
            assert.equal(metaCapiService._private.centsToMajor(1299, 'usd'), 12.99);
        });
    });

    describe('buildPurchaseEvent / buildSubscribeEvent', function () {
        const session = {
            id: 'cs_test_123',
            amount_total: 300,
            currency: 'twd',
            subscription: 'sub_123',
            customer_details: {name: 'Ray Wu', email: 'buyer@example.com'},
            metadata: {
                meta_event_id: 'checkout_abc',
                attribution_url: 'https://example.com/start-here',
                tier_id: 'tier_1'
            }
        };

        it('builds a Purchase event keyed to the browser meta_event_id', function () {
            const event = metaCapiService._private.buildPurchaseEvent({session});

            assert.equal(event.eventName, 'Purchase');
            assert.equal(event.eventId, 'checkout_abc');
            assert.equal(event.customData.value, 300);
            assert.equal(event.customData.currency, 'TWD');
            assert.equal(event.customData.order_id, 'cs_test_123');
            assert.deepEqual(event.userData.em, [sha256('buyer@example.com')]);
        });

        it('builds a Subscribe event sharing the same event id as Purchase', function () {
            const event = metaCapiService._private.buildSubscribeEvent({session});

            assert.equal(event.eventName, 'Subscribe');
            assert.equal(event.eventId, 'checkout_abc');
            assert.equal(event.customData.status, 'subscribed');
            assert.equal(event.customData.value, 300);
        });

        it('falls back to the session id when no meta_event_id was stashed', function () {
            const event = metaCapiService._private.buildPurchaseEvent({session: {...session, metadata: {}}});

            assert.equal(event.eventId, 'cs_test_123');
        });
    });

    describe('buildRenewalPurchaseEvent', function () {
        it('builds a renewal Purchase keyed to the invoice id', function () {
            const invoice = {
                id: 'in_123',
                amount_paid: 300,
                currency: 'twd',
                subscription: 'sub_123',
                customer: 'cus_123',
                customer_email: 'buyer@example.com',
                customer_name: 'Ray Wu'
            };
            const member = {
                id: 'member_123',
                get(key) {
                    return {email: 'member@example.com', name: 'Member Ray'}[key];
                }
            };

            const event = metaCapiService._private.buildRenewalPurchaseEvent({invoice, member});

            assert.equal(event.eventName, 'Purchase');
            assert.equal(event.eventId, 'renewal_in_123');
            assert.equal(event.customData.value, 300);
            assert.equal(event.customData.currency, 'TWD');
            assert.equal(event.customData.status, 'renewal');
            assert.equal(event.customData.subscription_id, 'sub_123');
            assert.deepEqual(event.userData.em, [sha256('member@example.com')]);
            assert.equal(event.userData.external_id, sha256('member_123'));
        });
    });

    describe('buildUserData', function () {
        it('hashes normalized customer identifiers and keeps Meta browser ids raw', function () {
            const userData = metaCapiService._private.buildUserData({
                email: '  Buyer@Example.COM ',
                name: 'Ray Wu',
                externalId: 'member_123',
                fbp: 'fb.1.123.456',
                fbc: 'fb.1.123.fbclid',
                clientIpAddress: '203.0.113.1',
                clientUserAgent: 'Mozilla/5.0'
            });

            assert.deepEqual(userData.em, [sha256('buyer@example.com')]);
            assert.equal(userData.fn, sha256('ray'));
            assert.equal(userData.ln, sha256('wu'));
            assert.equal(userData.external_id, sha256('member_123'));
            assert.equal(userData.fbp, 'fb.1.123.456');
            assert.equal(userData.fbc, 'fb.1.123.fbclid');
            assert.equal(userData.client_ip_address, '203.0.113.1');
            assert.equal(userData.client_user_agent, 'Mozilla/5.0');
        });
    });
});
