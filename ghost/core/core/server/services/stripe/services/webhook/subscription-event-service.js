const errors = require('@tryghost/errors');
const logging = require('@tryghost/logging');
const _ = require('lodash');

/**
 * Handles `customer.subscription.*` webhook events
 *
 * The `customer.subscription.*` events are triggered when a customer's subscription status changes.
 *
 * This service is responsible for handling these events and updating the subscription status in Ghost,
 * although it mostly delegates the responsibility to the `MemberRepository`.
 */
module.exports = class SubscriptionEventService {
    /**
     * @param {object} deps
     * @param {import('../../repositories/MemberRepository')} deps.memberRepository
     * @param {object} deps.productRepository
     */
    constructor(deps) {
        this.deps = deps;
    }

    /**
     * Handles a `customer.subscription.*` event
     *
     * Looks up the member by the Stripe customer ID and links the subscription to the member.
     * Ignores subscriptions for products not created by Ghost.
     * @param {import('stripe').Stripe.Subscription} subscription
     */
    async handleSubscriptionEvent(subscription) {
        const subscriptionPriceData = _.get(subscription, 'items.data');
        if (!subscriptionPriceData || subscriptionPriceData.length !== 1) {
            logging.info(`Ignoring subscription event ${subscription.id || '(unknown id)'} because it does not have exactly 1 price item`);
            return;
        }

        // Check if the subscription's product belongs to Ghost
        const stripeProductId = _.get(subscription, 'items.data[0].price.product');
        if (stripeProductId) {
            const productRepository = this.deps.productRepository;
            const ghostProduct = await productRepository.get({stripe_product_id: stripeProductId});
            if (!ghostProduct) {
                logging.info(`Ignoring subscription event for non-Ghost product ${stripeProductId} (subscription: ${subscription.id})`);
                return;
            }
        }

        const memberRepository = this.deps.memberRepository;
        const member = await memberRepository.get({
            customer_id: subscription.customer
        });

        if (member) {
            try {
                await memberRepository.linkSubscription({
                    id: member.id,
                    subscription
                });
            } catch (err) {
                if (err.code !== 'ER_DUP_ENTRY' && err.code !== 'SQLITE_CONSTRAINT') {
                    throw err;
                }
                throw new errors.ConflictError({err});
            }

            // If member is now paid, remove any complimentary access
            const updatedMember = await memberRepository.get({id: member.id});
            if (updatedMember && updatedMember.get('status') === 'paid') {
                await memberRepository.removeComplimentarySubscription({id: member.id});
            }
        }
    }
};
