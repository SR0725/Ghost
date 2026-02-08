const resendCampaigns = require('..');

module.exports = async function processScheduled() {
    resendCampaigns.init();
    return resendCampaigns.service.processScheduledCampaigns();
};
