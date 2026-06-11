const assert = require('node:assert/strict');
const sinon = require('sinon');

const db = require('../../../../core/server/data/db');
const courseMode = require('../../../../core/server/services/course-mode');

describe('Course mode service', function () {
    afterEach(function () {
        sinon.restore();
    });

    function member(status = 'paid') {
        return {
            id: 'member-id',
            status
        };
    }

    function memberWithActiveSubscription(status = 'free') {
        return {
            id: 'member-id',
            status,
            subscriptions: [{
                status: 'active'
            }]
        };
    }

    function queryBuilder(result) {
        return {
            join: sinon.stub().returnsThis(),
            select: sinon.stub().returnsThis(),
            where: sinon.stub().returnsThis(),
            whereIn: sinon.stub().returnsThis(),
            first: sinon.stub().resolves(result)
        };
    }

    function stubPurchaseLookups({conversion = null, label = null} = {}) {
        const labelQuery = queryBuilder(label);
        const conversionQuery = queryBuilder(conversion);
        const knex = sinon.stub()
            .onFirstCall().returns(labelQuery)
            .onSecondCall().returns(conversionQuery);

        sinon.stub(db, 'knex').get(() => {
            return knex;
        });

        return {
            knex,
            conversionQuery,
            labelQuery
        };
    }

    describe('hasCoursePurchaseContext', function () {
        it('does not enable course mode for anonymous visitors', async function () {
            const knexStub = sinon.stub();
            sinon.stub(db, 'knex').get(() => {
                return knexStub;
            });

            assert.equal(await courseMode.hasCoursePurchaseContext(null), false);
            sinon.assert.notCalled(knexStub);
        });

        it('does not enable course mode for free members', async function () {
            const {knex} = stubPurchaseLookups();

            assert.equal(await courseMode.hasCoursePurchaseContext(member('free')), false);
            sinon.assert.calledOnce(knex);
        });

        it('enables course mode for paid members attributed to start-here', async function () {
            stubPurchaseLookups({
                conversion: {id: 'conversion-id'}
            });

            assert.equal(await courseMode.hasCoursePurchaseContext(member()), true);
        });

        it('enables course mode for members with a manual course label', async function () {
            stubPurchaseLookups({
                label: {id: 'label-id'}
            });

            assert.equal(await courseMode.hasCoursePurchaseContext(member('free')), true);
        });

        it('enables course mode for members with an active subscription even if status is stale', async function () {
            stubPurchaseLookups({
                conversion: {id: 'conversion-id'}
            });

            assert.equal(await courseMode.hasCoursePurchaseContext(memberWithActiveSubscription()), true);
        });

        it('does not enable course mode for homepage purchasers just because they visit start-here', async function () {
            stubPurchaseLookups();

            assert.equal(await courseMode.hasCoursePurchaseContext(member(), '/start-here'), false);
        });
    });
});
