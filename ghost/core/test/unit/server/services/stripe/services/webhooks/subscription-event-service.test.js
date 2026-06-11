const sinon = require('sinon');
const assert = require('node:assert/strict');

const SubscriptionEventService = require('../../../../../../../core/server/services/stripe/services/webhook/subscription-event-service');

describe('SubscriptionEventService', function () {
    let service;
    let memberRepository;
    let productRepository;

    beforeEach(function () {
        memberRepository = {get: sinon.stub(), linkSubscription: sinon.stub(), removeComplimentarySubscription: sinon.stub()};
        productRepository = {get: sinon.stub()};
        // By default, product exists in Ghost (is a Ghost product)
        productRepository.get.resolves({id: 'ghost_product_123'});

        service = new SubscriptionEventService({memberRepository, productRepository});
    });

    it('should ignore subscription event if it has no price item', async function () {
        const subscription = {
            items: {
                data: []
            }
        };

        await service.handleSubscriptionEvent(subscription);

        sinon.assert.notCalled(memberRepository.get);
        sinon.assert.notCalled(memberRepository.linkSubscription);
    });

    it('should ignore subscription event for product outside the env whitelist', async function () {
        const subscription = {
            id: 'sub_456',
            items: {
                data: [{price: {id: 'price_123', product: 'prod_non_ghost'}}]
            },
            customer: 'cust_123'
        };

        const originalWhitelist = process.env.GHOST_STRIPE_PRODUCT_IDS;
        process.env.GHOST_STRIPE_PRODUCT_IDS = 'prod_ghost';
        try {
            await service.handleSubscriptionEvent(subscription);
        } finally {
            if (originalWhitelist === undefined) {
                delete process.env.GHOST_STRIPE_PRODUCT_IDS;
            } else {
                process.env.GHOST_STRIPE_PRODUCT_IDS = originalWhitelist;
            }
        }

        sinon.assert.notCalled(memberRepository.get);
        sinon.assert.notCalled(memberRepository.linkSubscription);
    });

    it('should process subscription event for Ghost product', async function () {
        const subscription = {
            id: 'sub_789',
            items: {
                data: [{price: {id: 'price_123', product: 'prod_ghost'}}]
            },
            customer: 'cust_123'
        };

        memberRepository.get
            .onFirstCall().resolves({id: 'member_123'})
            .onSecondCall().resolves({get: sinon.stub().returns('free')});

        await service.handleSubscriptionEvent(subscription);

        sinon.assert.calledWith(memberRepository.linkSubscription, {id: 'member_123', subscription});
    });

    it('should throw ConflictError if linkSubscription fails with ER_DUP_ENTRY', async function () {
        const subscription = {
            items: {
                data: [{price: {id: 'price_123', product: 'prod_ghost'}}]
            },
            customer: 'cust_123'
        };

        memberRepository.get.resolves({id: 'member_123'});
        memberRepository.linkSubscription.rejects({code: 'ER_DUP_ENTRY'});

        try {
            await service.handleSubscriptionEvent(subscription);
            assert.fail('Expected ConflictError');
        } catch (err) {
            assert(err.name, 'ConflictError');
        }
    });

    it('should throw ConflictError if linkSubscription fails with SQLITE_CONSTRAINT', async function () {
        const subscription = {
            items: {
                data: [{price: {id: 'price_123'}}]
            },
            customer: 'cust_123'
        };

        memberRepository.get.resolves({id: 'member_123'});
        memberRepository.linkSubscription.rejects({code: 'SQLITE_CONSTRAINT'});

        try {
            await service.handleSubscriptionEvent(subscription);
            assert.fail('Expected ConflictError');
        } catch (err) {
            assert(err.name, 'ConflictError');
        }
    });

    it('should throw if linkSubscription fails with unexpected error', async function () {
        const subscription = {
            items: {
                data: [{price: {id: 'price_123'}}]
            },
            customer: 'cust_123'
        };

        memberRepository.get.resolves({id: 'member_123'});
        memberRepository.linkSubscription.rejects(new Error('Unexpected error'));

        try {
            await service.handleSubscriptionEvent(subscription);
            assert.fail('Expected error');
        } catch (err) {
            assert.equal(err.message, 'Unexpected error');
        }
    });

    it('should catch and rethrow unexpected errors from member repository', async function () {
        memberRepository.get.rejects(new Error('Unexpected error'));

        try {
            await service.handleSubscriptionEvent({items: {data: [{price: {id: 'price_123'}}]}});
            assert.fail('Expected error');
        } catch (err) {
            assert.equal(err.message, 'Unexpected error');
        }
    });

    it('should call linkSubscription with correct arguments', async function () {
        const subscription = {
            items: {
                data: [{price: {id: 'price_123'}}]
            },
            customer: 'cust_123'
        };

        memberRepository.get
            .onFirstCall().resolves({id: 'member_123'})
            .onSecondCall().resolves({get: sinon.stub().returns('free')});

        await service.handleSubscriptionEvent(subscription);

        sinon.assert.calledWith(memberRepository.linkSubscription, {id: 'member_123', subscription});
    });
});
