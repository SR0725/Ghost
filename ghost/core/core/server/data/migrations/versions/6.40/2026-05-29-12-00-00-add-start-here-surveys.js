const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasTable('start_here_surveys');

        if (exists) {
            return;
        }

        await knex.schema.createTable('start_here_surveys', function (table) {
            table.string('id', 24).notNullable().primary();
            table.string('member_id', 24).notNullable().references('members.id').onDelete('CASCADE');
            // Answer columns are nullable: a row may exist with only `dismissed_at`
            // set (user closed the modal without filling), or with answers filled
            // (q1_situation is the sentinel — if non-null, the row is a real response).
            table.string('q1_situation', 50).nullable();
            table.text('q2_reasons').nullable();
            table.text('q3_top_topics').nullable();
            table.text('q4_blocker').nullable();
            table.string('q5_source', 50).nullable();
            table.text('q6_kpi').nullable();
            table.string('q1_other', 191).nullable();
            table.string('q2_other', 191).nullable();
            table.string('q3_other', 191).nullable();
            table.string('q5_other', 191).nullable();
            table.dateTime('dismissed_at').nullable();
            table.dateTime('created_at').notNullable();
            table.dateTime('updated_at').notNullable();

            table.unique(['member_id'], 'shs_member_unique');
            table.index(['created_at'], 'shs_created_idx');
        });
    },
    async function down(knex) {
        await knex.schema.dropTableIfExists('start_here_surveys');
    }
);
