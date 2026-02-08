const {ResendCampaignsService} = require('./resend-campaigns-service');
const ResendClient = require('./resend-client');

class ResendCampaignsServiceWrapper {
    init() {
        if (this.service) {
            return;
        }

        const db = require('../../data/db');
        const models = require('../../models');
        const config = require('../../../shared/config');
        const jobsService = require('../jobs');

        this.service = new ResendCampaignsService({
            db,
            models,
            config,
            jobsService,
            resendClientFactory: () => {
                const resendConfig = config.get('bulkEmail')?.resend || {};
                return new ResendClient({
                    apiKey: resendConfig.apiKey,
                    baseUrl: resendConfig.baseUrl || 'https://api.resend.com'
                });
            }
        });

        this.service.init();
    }
}

module.exports = ResendCampaignsServiceWrapper;
