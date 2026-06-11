const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasTable('course_post_progress');

        if (exists) {
            return;
        }

        await knex.schema.createTable('course_post_progress', function (table) {
            table.string('id', 24).notNullable().primary();
            table.string('member_id', 24).notNullable().references('members.id').onDelete('CASCADE');
            table.string('post_id', 24).notNullable().references('posts.id').onDelete('CASCADE');
            table.dateTime('completed_at').nullable();
            table.dateTime('created_at').notNullable();
            table.dateTime('updated_at').nullable();

            table.unique(['member_id', 'post_id'], 'cpp_member_post_unique');
            table.index(['member_id', 'completed_at'], 'cpp_member_completed_idx');
        });
    },
    async function down(knex) {
        await knex.schema.dropTableIfExists('course_post_progress');
    }
);
