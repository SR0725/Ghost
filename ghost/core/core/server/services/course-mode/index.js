/* eslint-disable max-lines */
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const db = require('../../data/db');
const urlUtils = require('../../../shared/url-utils');

function getMemberId(member) {
    return member?.id || member?.get?.('id') || null;
}

function getMemberStatus(member) {
    return member?.status || member?.get?.('status') || null;
}

function getMemberPaidFlag(member) {
    return member?.paid ?? member?.get?.('paid') ?? null;
}

function getMemberSubscriptions(member) {
    const subscriptions = member?.subscriptions || member?.get?.('subscriptions') || [];

    if (typeof subscriptions.toArray === 'function') {
        return subscriptions.toArray();
    }

    return Array.isArray(subscriptions) ? subscriptions : [];
}

function isPaidMember(member) {
    const status = getMemberStatus(member);
    const paidFlag = getMemberPaidFlag(member);

    if (!member) {
        return false;
    }

    if (paidFlag === true) {
        return true;
    }

    if (status && status !== 'free') {
        return true;
    }

    return getMemberSubscriptions(member).some((subscription) => {
        return ['active', 'trialing', 'unpaid', 'past_due'].includes(subscription?.status);
    });
}

function isCourseLabel(slug) {
    return ['course', 'start-here', 'experience-course'].includes(slug);
}

function applyStartHereAttributionFilter(query) {
    const absoluteStartHere = urlUtils.urlJoin(urlUtils.getSiteUrl(true), 'start-here');

    return query.where(function () {
        this.where('attribution_url', absoluteStartHere)
            .orWhere('attribution_url', `${absoluteStartHere}/`)
            .orWhere('attribution_url', 'like', `${absoluteStartHere}?%`)
            .orWhere('attribution_url', 'like', `${absoluteStartHere}/?%`)
            .orWhere('attribution_url', '/start-here')
            .orWhere('attribution_url', '/start-here/')
            .orWhere('attribution_url', 'like', '/start-here?%')
            .orWhere('attribution_url', 'like', '/start-here/?%');
    });
}

async function hasManualCourseLabel(member) {
    const memberId = getMemberId(member);
    if (!memberId) {
        return false;
    }

    const label = await db.knex('members_labels')
        .join('labels', 'labels.id', 'members_labels.label_id')
        .select('labels.id')
        .where('members_labels.member_id', memberId)
        .whereIn('labels.slug', ['course', 'start-here', 'experience-course'])
        .first();

    return Boolean(label);
}

async function hasCoursePurchaseContext(member) {
    if (!member) {
        return false;
    }

    const memberId = getMemberId(member);
    if (!memberId) {
        return false;
    }

    if (await hasManualCourseLabel(member)) {
        return true;
    }

    if (!isPaidMember(member)) {
        return false;
    }

    const conversionQuery = db.knex('members_subscription_created_events')
        .select('id')
        .where('member_id', memberId);
    const conversion = await applyStartHereAttributionFilter(conversionQuery).first();

    return Boolean(conversion);
}

function postPath(slug) {
    return urlUtils.urlJoin(urlUtils.getSubdir() || '/', slug, '/');
}

async function getCatalog(member, options = {}) {
    const enabled = await hasCoursePurchaseContext(member);

    if (!enabled) {
        return {
            enabled: false,
            chapters: [],
            progress: {
                completed: 0,
                total: 0
            }
        };
    }

    const memberId = getMemberId(member);
    const rows = await db.knex('posts')
        .join('posts_tags', 'posts_tags.post_id', 'posts.id')
        .join('tags', 'tags.id', 'posts_tags.tag_id')
        .leftJoin('course_post_progress', function () {
            this.on('course_post_progress.post_id', '=', 'posts.id')
                .andOn('course_post_progress.member_id', '=', db.knex.raw('?', [memberId]));
        })
        .select('posts.id')
        .select('posts.uuid')
        .select('posts.title')
        .select('posts.slug')
        .select('posts.published_at')
        .select('posts_tags.sort_order as post_tag_sort_order')
        .select('tags.id as tag_id')
        .select('tags.name as tag_name')
        .select('tags.slug as tag_slug')
        .select('tags.description as tag_description')
        .select('tags.visibility as tag_visibility')
        .select('course_post_progress.completed_at')
        .where({
            'posts.type': 'post',
            'posts.status': 'published'
        })
        .where('tags.visibility', 'public')
        .where('posts_tags.sort_order', 0)
        .orderBy('tags.name', 'asc')
        .orderBy('posts.published_at', 'desc');

    const chaptersById = new Map();
    let completed = 0;

    rows.forEach((row) => {
        if (!chaptersById.has(row.tag_id)) {
            chaptersById.set(row.tag_id, {
                id: row.tag_id,
                name: row.tag_name,
                slug: row.tag_slug,
                description: row.tag_description,
                posts: []
            });
        }

        const isCompleted = Boolean(row.completed_at);
        if (isCompleted) {
            completed += 1;
        }

        chaptersById.get(row.tag_id).posts.push({
            id: row.id,
            uuid: row.uuid,
            title: row.title,
            slug: row.slug,
            url: postPath(row.slug),
            published_at: row.published_at,
            completed: isCompleted,
            active: row.uuid === options.post_uuid
        });
    });

    const total = rows.length;

    return {
        enabled: true,
        chapters: Array.from(chaptersById.values()),
        progress: {
            completed,
            total,
            percent: total ? Math.round((completed / total) * 100) : 0
        }
    };
}

async function setProgress(member, payload = {}) {
    if (!await hasCoursePurchaseContext(member)) {
        throw new errors.NoPermissionError({message: 'You must be a course member to update course progress.'});
    }

    const memberId = getMemberId(member);
    const postUuid = typeof payload.post_uuid === 'string' ? payload.post_uuid.trim() : '';

    if (!memberId || !postUuid) {
        throw new errors.BadRequestError({message: 'Post UUID is required.'});
    }

    const post = await db.knex('posts')
        .select('id', 'uuid')
        .where({
            uuid: postUuid,
            type: 'post',
            status: 'published'
        })
        .first();

    if (!post) {
        throw new errors.NotFoundError({message: 'Post not found.'});
    }

    const now = new Date();
    const completedAt = payload.completed === false ? null : now;
    const existing = await db.knex('course_post_progress')
        .select('id')
        .where({
            member_id: memberId,
            post_id: post.id
        })
        .first();

    if (existing) {
        await db.knex('course_post_progress')
            .where({id: existing.id})
            .update({
                completed_at: completedAt,
                updated_at: now
            });
    } else {
        await db.knex('course_post_progress').insert({
            id: ObjectId().toHexString(),
            member_id: memberId,
            post_id: post.id,
            completed_at: completedAt,
            created_at: now,
            updated_at: now
        });
    }

    return {
        post_uuid: post.uuid,
        completed: Boolean(completedAt),
        completed_at: completedAt
    };
}

module.exports = {
    getCatalog,
    setProgress,
    hasCoursePurchaseContext,
    isCourseLabel
};
