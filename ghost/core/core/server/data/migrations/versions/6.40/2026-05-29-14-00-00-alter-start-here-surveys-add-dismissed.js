/* eslint-disable no-restricted-syntax */
const {createTransactionalMigration} = require('../../utils');
const logging = require('@tryghost/logging');

// The original create-table migration shipped with q* NOT NULL and no
// dismissed_at. The survey was later reworked so a row can represent a
// *dismissal* (user closed the modal without answering) — which needs
// dismissed_at, and needs the answer columns to be nullable.
//
// This migration is idempotent: guarded by hasColumn so it's a no-op on
// fresh installs (where the create-table migration already produced the
// final schema) and applies the change on databases that ran the old one.

const NULLABLE_ANSWER_COLUMNS = [
    {name: 'q1_situation', build: t => t.string('q1_situation', 50)},
    {name: 'q2_reasons', build: t => t.text('q2_reasons')},
    {name: 'q3_top_topics', build: t => t.text('q3_top_topics')},
    {name: 'q4_blocker', build: t => t.text('q4_blocker')},
    {name: 'q5_source', build: t => t.string('q5_source', 50)},
    {name: 'q6_kpi', build: t => t.text('q6_kpi')}
];

module.exports = createTransactionalMigration(
    async function up(knex) {
        const hasTable = await knex.schema.hasTable('start_here_surveys');
        if (!hasTable) {
            logging.warn('Skipping: start_here_surveys table does not exist');
            return;
        }

        const hasDismissedAt = await knex.schema.hasColumn('start_here_surveys', 'dismissed_at');
        if (!hasDismissedAt) {
            logging.info('Adding column start_here_surveys.dismissed_at');
            await knex.schema.alterTable('start_here_surveys', function (table) {
                table.dateTime('dismissed_at').nullable();
            });
        }

        logging.info('Making start_here_surveys answer columns nullable');
        await knex.schema.alterTable('start_here_surveys', function (table) {
            NULLABLE_ANSWER_COLUMNS.forEach(function (col) {
                col.build(table).nullable().alter();
            });
        });
    },
    async function down(knex) {
        const hasTable = await knex.schema.hasTable('start_here_surveys');
        if (!hasTable) {
            return;
        }

        const hasDismissedAt = await knex.schema.hasColumn('start_here_surveys', 'dismissed_at');
        if (hasDismissedAt) {
            await knex.schema.alterTable('start_here_surveys', function (table) {
                table.dropColumn('dismissed_at');
            });
        }
        // Intentionally do not revert nullability — reverting to NOT NULL could
        // fail if dismissal-only rows (null answers) exist.
    }
);
