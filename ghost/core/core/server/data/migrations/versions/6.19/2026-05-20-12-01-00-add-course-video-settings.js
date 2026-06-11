const ObjectId = require('bson-objectid').default;
const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

const settings = [
    {
        key: 'course_video_enabled',
        value: 'true',
        type: 'boolean',
        group: 'course_video'
    },
    {
        key: 'course_video_cloudflare_account_id',
        value: '',
        type: 'string',
        group: 'course_video'
    },
    {
        key: 'course_video_cloudflare_customer_code',
        value: '',
        type: 'string',
        group: 'course_video'
    },
    {
        key: 'course_video_cloudflare_api_token',
        value: '',
        type: 'string',
        group: 'course_video'
    },
    {
        key: 'course_video_cloudflare_signing_key_id',
        value: '',
        type: 'string',
        group: 'course_video'
    },
    {
        key: 'course_video_cloudflare_signing_key_jwk',
        value: '',
        type: 'string',
        group: 'course_video'
    }
];

module.exports = createTransactionalMigration(
    async function up(knex) {
        const now = knex.raw('CURRENT_TIMESTAMP');

        await Promise.all(settings.map(async (setting) => {
            const existing = await knex('settings').where('key', '=', setting.key).first();

            if (existing) {
                logging.warn(`Skipping adding setting: ${setting.key} - setting already exists`);
                return;
            }

            await knex('settings').insert({
                id: ObjectId().toHexString(),
                flags: null,
                created_at: now,
                ...setting
            });
        }));
    },
    async function down(knex) {
        await knex('settings')
            .whereIn('key', settings.map(setting => setting.key))
            .del();
    }
);
