const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasTable('post_course_videos');

        if (exists) {
            return;
        }

        await knex.schema.createTable('post_course_videos', function (table) {
            table.string('id', 24).notNullable().primary();
            table.string('post_id', 24).notNullable().unique().references('posts.id').onDelete('CASCADE');
            table.string('provider', 50).notNullable().defaultTo('youtube');
            table.text('provider_video_id').nullable();
            table.string('access', 50).notNullable().defaultTo('public');
            table.boolean('enabled').notNullable().defaultTo(false);
            table.string('title', 2000).nullable();
            table.text('metadata').nullable();
            table.dateTime('created_at').notNullable();
            table.dateTime('updated_at').nullable();
        });
    },
    async function down(knex) {
        await knex.schema.dropTableIfExists('post_course_videos');
    }
);
