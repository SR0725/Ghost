const resendCampaigns = require('../../services/resend-campaigns');

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'resend_campaigns',

    browseForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: true,
        data: ['id'],
        options: ['limit', 'page'],
        async query(frame) {
            resendCampaigns.init();
            return resendCampaigns.service.browseCampaignsForPost({
                postId: frame.data.id,
                limit: frame.options.limit,
                page: frame.options.page
            });
        }
    },

    estimateForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'browse'
        },
        data: ['id'],
        async query(frame) {
            resendCampaigns.init();
            const payload = frame.data?.resend_campaigns?.[0] || frame.data || {};
            return {
                resend_campaigns: [
                    await resendCampaigns.service.estimateRecipients({
                        postId: frame.data.id,
                        audience: payload.audience
                    })
                ]
            };
        }
    },

    createForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'edit'
        },
        data: ['id'],
        async query(frame) {
            resendCampaigns.init();
            const payload = frame.data?.resend_campaigns?.[0] || frame.data || {};
            return {
                resend_campaigns: [
                    await resendCampaigns.service.createCampaign({
                        postId: frame.data.id,
                        audience: payload.audience,
                        scheduledAtTaipei: payload.scheduled_at_taipei,
                        createdById: frame.options.context.user
                    })
                ]
            };
        }
    },

    confirmForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'edit'
        },
        data: ['id', 'campaign_id'],
        async query(frame) {
            resendCampaigns.init();
            const payload = frame.data?.resend_campaigns?.[0] || frame.data || {};
            return await resendCampaigns.service.confirmCampaign({
                postId: frame.data.id,
                campaignId: frame.data.campaign_id,
                confirmationToken: payload.confirmation_token
            });
        }
    },

    readForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'browse'
        },
        data: ['id', 'campaign_id'],
        async query(frame) {
            resendCampaigns.init();
            return await resendCampaigns.service.readCampaign({
                postId: frame.data.id,
                campaignId: frame.data.campaign_id
            });
        }
    },

    browseRecipientsForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'browse'
        },
        data: ['id', 'campaign_id'],
        options: ['limit', 'page'],
        async query(frame) {
            resendCampaigns.init();
            return await resendCampaigns.service.browseRecipients({
                postId: frame.data.id,
                campaignId: frame.data.campaign_id,
                limit: frame.options.limit,
                page: frame.options.page
            });
        }
    },

    syncForPost: {
        headers: {
            cacheInvalidate: false
        },
        permissions: {
            method: 'browse'
        },
        data: ['id', 'campaign_id'],
        async query(frame) {
            resendCampaigns.init();
            return await resendCampaigns.service.syncCampaign({
                postId: frame.data.id,
                campaignId: frame.data.campaign_id
            });
        }
    },

    exportRecipientsCsvForPost: {
        headers: {
            disposition: {
                type: 'csv',
                value(frame) {
                    return `resend-campaign-${frame.data.campaign_id}-recipients.csv`;
                }
            },
            cacheInvalidate: false
        },
        response: {
            format: 'plain'
        },
        permissions: {
            method: 'browse'
        },
        data: ['id', 'campaign_id'],
        async query(frame) {
            resendCampaigns.init();
            return {
                data: await resendCampaigns.service.exportRecipientsCsv({
                    postId: frame.data.id,
                    campaignId: frame.data.campaign_id
                })
            };
        }
    }
};

module.exports = controller;
