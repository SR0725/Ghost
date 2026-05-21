const {createTransactionalMigration} = require('../../utils');

module.exports = createTransactionalMigration(
    async function up(knex) {
        const exists = await knex.schema.hasTable('course_video_events');

        if (exists) {
            return;
        }

        await knex.schema.createTable('course_video_events', function (table) {
            table.string('id', 24).notNullable().primary();
            table.string('post_id', 24).notNullable().references('posts.id').onDelete('CASCADE');
            table.string('post_course_video_id', 24).notNullable().references('post_course_videos.id').onDelete('CASCADE');
            table.string('session_id', 64).notNullable();
            table.string('member_status', 50).notNullable().defaultTo('anonymous');
            table.string('event_type', 50).notNullable();
            table.string('provider', 50).notNullable();
            table.string('access', 50).notNullable();
            table.integer('playback_position_seconds').unsigned().nullable();
            table.integer('duration_seconds').unsigned().nullable();
            table.integer('watch_seconds').unsigned().nullable();
            table.integer('progress_percent').unsigned().nullable();
            table.text('metadata').nullable();
            table.dateTime('created_at').notNullable();

            table.index(['post_course_video_id', 'event_type'], 'cve_video_event_idx');
            table.index(['post_id', 'created_at'], 'cve_post_created_idx');
            table.index(['session_id', 'post_course_video_id', 'event_type'], 'cve_session_video_event_idx');
        });
    },
    async function down(knex) {
        await knex.schema.dropTableIfExists('course_video_events');
    }
);
