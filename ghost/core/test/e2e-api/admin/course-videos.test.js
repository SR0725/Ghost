const assert = require('node:assert/strict');
const {agentProvider, fixtureManager} = require('../../utils/e2e-framework');
const models = require('../../../core/server/models');

describe('Course Videos API', function () {
    let agent;
    let post;

    before(async function () {
        agent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('posts');
        await agent.loginAsOwner();
    });

    beforeEach(async function () {
        await models.Base.knex('post_course_videos').del();
        post = await models.Post.findOne({type: 'post', status: 'all'});
    });

    it('Can read an empty course video for a post', async function () {
        const {body} = await agent.get(`posts/${post.id}/course_video/`)
            .expectStatus(200);

        assert.equal(body.course_videos[0].id, null);
        assert.equal(body.course_videos[0].post_id, post.id);
        assert.equal(body.course_videos[0].post_uuid, post.get('uuid'));
        assert.equal(body.course_videos[0].enabled, false);
        assert.equal(body.course_videos[0].provider, 'youtube');
        assert.equal(body.course_videos[0].access, 'public');
    });

    it('Can create and update a post course video', async function () {
        const {body} = await agent.put(`posts/${post.id}/course_video/`)
            .body({
                course_videos: [{
                    enabled: true,
                    provider: 'cloudflare_stream',
                    provider_video_id: 'ab7891ef5fefcb18d4a39a0872bf4ef6',
                    access: 'paid',
                    title: 'Paid course lesson'
                }]
            })
            .expectStatus(200);

        assert.equal(body.course_videos[0].post_id, post.id);
        assert.equal(body.course_videos[0].enabled, true);
        assert.equal(body.course_videos[0].provider, 'cloudflare_stream');
        assert.equal(body.course_videos[0].provider_video_id, 'ab7891ef5fefcb18d4a39a0872bf4ef6');
        assert.equal(body.course_videos[0].access, 'paid');
        assert.equal(body.course_videos[0].title, 'Paid course lesson');

        const updated = await agent.put(`posts/${post.id}/course_video/`)
            .body({
                course_videos: [{
                    access: 'members',
                    title: 'Members course lesson'
                }]
            })
            .expectStatus(200);

        assert.equal(updated.body.course_videos[0].provider, 'cloudflare_stream');
        assert.equal(updated.body.course_videos[0].provider_video_id, 'ab7891ef5fefcb18d4a39a0872bf4ef6');
        assert.equal(updated.body.course_videos[0].access, 'members');
        assert.equal(updated.body.course_videos[0].title, 'Members course lesson');
    });

    it('Rejects enabling a course video without a video ID', async function () {
        await agent.put(`posts/${post.id}/course_video/`)
            .body({
                course_videos: [{
                    enabled: true,
                    provider: 'youtube'
                }]
            })
            .expectStatus(422);
    });

    it('Can delete a post course video', async function () {
        await agent.put(`posts/${post.id}/course_video/`)
            .body({
                course_videos: [{
                    enabled: true,
                    provider: 'youtube',
                    provider_video_id: 'dQw4w9WgXcQ'
                }]
            })
            .expectStatus(200);

        await agent.delete(`posts/${post.id}/course_video/`)
            .expectStatus(204);

        const {body} = await agent.get(`posts/${post.id}/course_video/`)
            .expectStatus(200);

        assert.equal(body.course_videos[0].id, null);
        assert.equal(body.course_videos[0].enabled, false);
    });
});
