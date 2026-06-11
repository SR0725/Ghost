const assert = require('node:assert/strict');
const {getPreview, hasAccess, normalizeYouTubeId} = require('../../../../core/server/services/course-videos');

describe('Course videos service', function () {
    describe('hasAccess', function () {
        it('allows public videos for anonymous visitors', function () {
            const courseVideo = {enabled: true, access: 'public'};

            assert.equal(hasAccess(courseVideo, null), true);
        });

        it('blocks disabled videos', function () {
            const courseVideo = {enabled: false, access: 'public'};

            assert.equal(hasAccess(courseVideo, null), false);
        });

        it('blocks members videos for anonymous visitors', function () {
            const courseVideo = {enabled: true, access: 'members'};

            assert.equal(hasAccess(courseVideo, null), false);
        });

        it('allows members videos for free members', function () {
            const courseVideo = {enabled: true, access: 'members'};

            assert.equal(hasAccess(courseVideo, {status: 'free'}), true);
        });

        it('allows members videos for paid members', function () {
            const courseVideo = {enabled: true, access: 'members'};

            assert.equal(hasAccess(courseVideo, {status: 'paid'}), true);
        });

        it('blocks paid videos for free members', function () {
            const courseVideo = {enabled: true, access: 'paid'};

            assert.equal(hasAccess(courseVideo, {status: 'free'}), false);
        });

        it('allows paid videos for paid members', function () {
            const courseVideo = {enabled: true, access: 'paid'};

            assert.equal(hasAccess(courseVideo, {status: 'paid'}), true);
        });

        it('allows paid videos for comped members', function () {
            const courseVideo = {enabled: true, access: 'paid'};

            assert.equal(hasAccess(courseVideo, {status: 'comped'}), true);
        });
    });

    describe('getPreview', function () {
        it('does not return an insecure preview for anonymous visitors on paid videos', function () {
            const courseVideo = {enabled: true, access: 'paid'};

            assert.deepEqual(getPreview(courseVideo, null), {
                enabled: false,
                required_access: 'paid'
            });
        });

        it('does not return an insecure preview for free members on paid videos', function () {
            const courseVideo = {enabled: true, access: 'paid'};

            assert.deepEqual(getPreview(courseVideo, {status: 'free'}), {
                enabled: false,
                required_access: 'paid'
            });
        });

        it('does not return a preview for authorized members', function () {
            const courseVideo = {enabled: true, access: 'members'};

            assert.deepEqual(getPreview(courseVideo, {status: 'free'}), {
                enabled: false
            });
        });
    });

    describe('normalizeYouTubeId', function () {
        it('extracts ids from YouTube watch URLs', function () {
            assert.equal(normalizeYouTubeId('https://www.youtube.com/watch?v=abc123'), 'abc123');
        });

        it('extracts ids from youtu.be URLs', function () {
            assert.equal(normalizeYouTubeId('https://youtu.be/abc123'), 'abc123');
        });

        it('passes plain ids through', function () {
            assert.equal(normalizeYouTubeId('abc123'), 'abc123');
        });
    });
});
