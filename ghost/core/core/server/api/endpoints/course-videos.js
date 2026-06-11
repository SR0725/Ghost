const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const _ = require('lodash');
const models = require('../../models');

const ALLOWED_PROVIDERS = ['cloudflare_stream', 'youtube'];
const ALLOWED_ACCESS = ['public', 'members', 'paid'];

const messages = {
    postNotFound: 'Post not found.',
    courseVideoIdRequired: 'Course video ID is required when course video is enabled.',
    invalidPayload: 'A course video payload is required.'
};

function getCourseVideoPayload(frame) {
    if (frame.data.course_videos?.[0]) {
        return frame.data.course_videos[0];
    }

    if (Array.isArray(frame.data.course_video) && frame.data.course_video[0]) {
        return frame.data.course_video[0];
    }

    if (frame.data.course_video && !Array.isArray(frame.data.course_video)) {
        return frame.data.course_video;
    }

    throw new errors.ValidationError({
        message: tpl(messages.invalidPayload),
        property: 'course_videos'
    });
}

async function getPost(frame) {
    const post = await models.Post.findOne({
        id: frame.options.id,
        status: 'all'
    }, {
        ...frame.options,
        withRelated: ['course_video']
    });

    if (!post) {
        throw new errors.NotFoundError({
            message: tpl(messages.postNotFound)
        });
    }

    return post;
}

function serializeCourseVideo(courseVideo, post) {
    const data = courseVideo?.toJSON ? courseVideo.toJSON() : courseVideo;

    return {
        id: data?.id || null,
        post_id: post.id,
        post_uuid: post.get('uuid'),
        enabled: data?.enabled || false,
        provider: data?.provider || 'youtube',
        provider_video_id: data?.provider_video_id || null,
        access: data?.access || 'public',
        title: data?.title || null,
        metadata: data?.metadata || null,
        created_at: data?.created_at || null,
        updated_at: data?.updated_at || null
    };
}

function normalizeCourseVideoPayload(payload, existing = {}) {
    const allowedFields = ['enabled', 'provider', 'provider_video_id', 'access', 'title', 'metadata'];
    const data = {
        provider: 'youtube',
        access: 'public',
        enabled: false,
        ..._.pick(existing, allowedFields),
        ..._.pick(payload, allowedFields)
    };

    if (data.provider && !ALLOWED_PROVIDERS.includes(data.provider)) {
        throw new errors.ValidationError({
            message: `Provider must be one of: ${ALLOWED_PROVIDERS.join(', ')}.`,
            property: 'course_videos.provider'
        });
    }

    if (data.access && !ALLOWED_ACCESS.includes(data.access)) {
        throw new errors.ValidationError({
            message: `Access must be one of: ${ALLOWED_ACCESS.join(', ')}.`,
            property: 'course_videos.access'
        });
    }

    data.provider_video_id = _.toString(data.provider_video_id || '').trim() || null;
    data.title = _.toString(data.title || '').trim() || null;

    if (data.metadata === '') {
        data.metadata = null;
    }

    if (data.enabled && !data.provider_video_id) {
        throw new errors.ValidationError({
            message: tpl(messages.courseVideoIdRequired),
            property: 'course_videos.provider_video_id'
        });
    }

    return data;
}

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'course_videos',

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: {
            docName: 'posts',
            method: 'read'
        },
        async query(frame) {
            const post = await getPost(frame);
            const courseVideo = post.related('course_video');

            return serializeCourseVideo(courseVideo?.get('id') ? courseVideo : null, post);
        }
    },

    edit: {
        headers: {
            cacheInvalidate: true
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: {
            docName: 'posts',
            method: 'edit'
        },
        async query(frame) {
            const post = await getPost(frame);
            const existingModel = post.related('course_video');
            const existing = existingModel?.get('id') ? existingModel.toJSON() : {};
            const data = normalizeCourseVideoPayload(getCourseVideoPayload(frame), existing);

            let courseVideo;
            if (existing.id) {
                courseVideo = await models.PostCourseVideo.edit(data, {
                    id: existing.id,
                    context: frame.options.context
                });
            } else {
                courseVideo = await models.PostCourseVideo.add({
                    ...data,
                    post_id: post.id
                }, {
                    context: frame.options.context
                });
            }

            return serializeCourseVideo(courseVideo, post);
        }
    },

    destroy: {
        statusCode: 204,
        headers: {
            cacheInvalidate: true
        },
        options: [
            'id'
        ],
        validation: {
            options: {
                id: {
                    required: true
                }
            }
        },
        permissions: {
            docName: 'posts',
            method: 'edit'
        },
        async query(frame) {
            const post = await getPost(frame);
            const courseVideo = post.related('course_video');

            if (courseVideo?.get('id')) {
                await models.PostCourseVideo.destroy({
                    id: courseVideo.get('id'),
                    context: frame.options.context
                });
            }
        }
    }
};

module.exports = controller;
