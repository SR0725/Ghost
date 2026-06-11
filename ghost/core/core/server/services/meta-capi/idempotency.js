const logging = require('@tryghost/logging');
const db = require('../../data/db');

/**
 * Meta CAPI 事件去重（server-side idempotency）
 *
 * 背景（2026-04-28 事故）：Stripe webhook 會重試、同一訂閱可能從多個 endpoint 觸發，
 * 若無 server 端原子鎖，Meta CAPI 會多計（實測曾多計 70%）。靠 Meta 60min event_id
 * dedup window 是脆弱保險（reload / 跨裝置 / 隔日都會失效）。
 *
 * 本模組用一張 runtime-ensured 表 `meta_capi_events`（event_id 為 primary key）做原子去重：
 * insert 成功 = 第一次，回傳 true 允許送；unique 衝突 = 已送過，回傳 false 跳過。
 * 不走 Ghost migration framework，避免動到 schema 版本機制。
 */

const TABLE = 'meta_capi_events';

let tableReady = null;

async function ensureTable() {
    if (!tableReady) {
        tableReady = (async () => {
            const has = await db.knex.schema.hasTable(TABLE);
            if (!has) {
                try {
                    await db.knex.schema.createTable(TABLE, (t) => {
                        t.string('event_id', 191).primary();
                        t.dateTime('created_at').notNullable();
                    });
                } catch (err) {
                    // 並發建表競態：另一個請求已建好則視為成功，否則拋出
                    const nowHas = await db.knex.schema.hasTable(TABLE);
                    if (!nowHas) {
                        throw err;
                    }
                }
            }
        })().catch((err) => {
            tableReady = null; // 允許下次重試
            throw err;
        });
    }
    return tableReady;
}

/**
 * 嘗試認領一個 event_id。
 * @returns {Promise<boolean>} true = 第一次認領（應送 CAPI）；false = 已送過（跳過）
 *
 * Fail-open 設計：任何基礎設施錯誤都回傳 true（寧可重送讓 Meta dedup 兜，也不要漏送），
 * 唯有「確認該 event_id 已存在」時才回傳 false。
 */
async function claimEvent(eventId) {
    if (!eventId) {
        return true; // 沒有 id 不擋
    }
    try {
        await ensureTable();
        await db.knex(TABLE).insert({event_id: eventId, created_at: new Date()});
        return true;
    } catch (err) {
        // insert 失敗：可能是 unique 衝突（已送），也可能是其他錯誤。查一次以區分。
        try {
            const existing = await db.knex(TABLE).where({event_id: eventId}).first();
            if (existing) {
                logging.info(`[meta-capi] event ${eventId} already fired, skip`);
                return false;
            }
        } catch (e2) {
            // 連查都失敗 → fail-open
        }
        logging.warn(`[meta-capi] idempotency claim error for ${eventId}, fail-open: ${err.message}`);
        return true;
    }
}

module.exports = {claimEvent};
