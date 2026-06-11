const {getSettings} = require('./settings');

function getEventSourceUrl(input) {
    const {siteUrl} = getSettings();
    if (!input && siteUrl) {
        return siteUrl;
    }

    try {
        return new URL(input, siteUrl || undefined).href;
    } catch (err) {
        return siteUrl || null;
    }
}

module.exports = {
    getEventSourceUrl
};
