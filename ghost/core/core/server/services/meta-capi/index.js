const logging = require('@tryghost/logging');
const {buildUserData, hash} = require('./identity');
const {centsToMajor} = require('./money');
const {buildPurchaseEvent, buildSubscribeEvent, buildRenewalPurchaseEvent} = require('./purchase');
const {getEventSourceUrl} = require('./url');
const {capture} = require('./capture');

// fire-and-forget wrappers：分析失敗絕不影響金流處理
function capturePurchase(data) {
    capture(buildPurchaseEvent(data)).catch(err => logging.warn(`Meta CAPI Purchase error: ${err.message}`));
}

function captureSubscribe(data) {
    capture(buildSubscribeEvent(data)).catch(err => logging.warn(`Meta CAPI Subscribe error: ${err.message}`));
}

function captureRenewal(data) {
    capture(buildRenewalPurchaseEvent(data)).catch(err => logging.warn(`Meta CAPI renewal Purchase error: ${err.message}`));
}

module.exports = {
    capture,
    capturePurchase,
    captureSubscribe,
    captureRenewal,
    _private: {buildUserData, buildPurchaseEvent, buildSubscribeEvent, buildRenewalPurchaseEvent, centsToMajor, getEventSourceUrl, hash}
};
