const config = require('../../../shared/config');

// "Ray 的部落格" pixel — start-here Subscribe / Purchase 事件目的地
const DEFAULT_PIXEL_ID = '1683574676119527';

function getSettings() {
    const settings = config.get('metaCapi') || {};
    // 兩種環境變數名都接受：META_CAPI_ACCESS_TOKEN / META_CAPI_PIXEL_ID 是 v1.6.17 統一規範；
    // META_CAPI_API / META_PIXEL_ID 是舊草稿保留相容。
    const tokenEnv = process.env.META_CAPI_ACCESS_TOKEN || process.env.META_CAPI_API || null;
    const pixelEnv = process.env.META_CAPI_PIXEL_ID || process.env.META_PIXEL_ID || null;
    const token = settings.accessToken || tokenEnv;
    const pixelId = settings.pixelId || pixelEnv || DEFAULT_PIXEL_ID;
    return {
        enabled: Boolean(token && pixelId),
        accessToken: token,
        pixelId,
        testEventCode: settings.testEventCode || process.env.META_TEST_EVENT_CODE || null,
        siteUrl: (settings.siteUrl || config.get('url') || '').replace(/\/+$/, '')
    };
}

module.exports = {
    getSettings,
    // alias for callers expecting getMetaCapiSettings
    getMetaCapiSettings: getSettings
};
