/* eslint-disable camelcase, max-lines */
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const db = require('../../data/db');

const Q1_OPTIONS = new Set([
    'discovering',
    'pre_product',
    'pre_revenue',
    'unstable',
    'mid_3_10',
    'growth_10plus',
    'side_hustle',
    'spectator',
    'other'
]);

const Q2_OPTIONS = new Set([
    'codex_workflow',
    'indie_saas',
    'ai_creator',
    'usa_company',
    'ai_news',
    'super_individual',
    'real_numbers',
    'ray_as_person',
    'community',
    'other'
]);

const Q3_OPTIONS = new Set([
    's1_codex',
    's2_indie_saas',
    's3_creator',
    's4_usa_company',
    's5_ai_news',
    's6_super_individual'
]);

const Q5_OPTIONS = new Set([
    'ios_course',
    'threads',
    'line',
    'referral',
    'google_blog',
    'ads',
    'other'
]);

function getMemberId(member) {
    return member?.id || member?.get?.('id') || null;
}

function getMemberStatus(member) {
    return member?.status || member?.get?.('status') || null;
}

function isPaidMember(member) {
    const status = getMemberStatus(member);
    return Boolean(member) && status && status !== 'free';
}

async function hasStartHereLabel(member) {
    const memberId = getMemberId(member);
    if (!memberId) {
        return false;
    }
    const row = await db.knex('members_labels')
        .join('labels', 'labels.id', 'members_labels.label_id')
        .where('members_labels.member_id', memberId)
        .where('labels.slug', 'start-here')
        .first();
    return Boolean(row);
}

/**
 * The modal is gated on three things:
 *   1. Member is logged in (checked at endpoint level)
 *   2. Member has a paid/comped status
 *   3. Member has the `start-here` label (so Ray can scope who gets surveyed
 *      — only people who arrived via the Start Here funnel, set manually
 *      in Admin or by future automation)
 */
async function isEligibleMember(member) {
    if (!isPaidMember(member)) {
        return false;
    }
    return hasStartHereLabel(member);
}

function ensureOption(value, valid, fieldName) {
    if (typeof value !== 'string' || !valid.has(value)) {
        throw new errors.BadRequestError({message: `Invalid ${fieldName} value`});
    }
}

function ensureOptionArray(value, valid, fieldName, {min, max, exact}) {
    if (!Array.isArray(value)) {
        throw new errors.BadRequestError({message: `${fieldName} must be an array`});
    }
    if (exact !== undefined && value.length !== exact) {
        throw new errors.BadRequestError({message: `${fieldName} must have exactly ${exact} items`});
    }
    if (min !== undefined && value.length < min) {
        throw new errors.BadRequestError({message: `${fieldName} must have at least ${min} items`});
    }
    if (max !== undefined && value.length > max) {
        throw new errors.BadRequestError({message: `${fieldName} must have at most ${max} items`});
    }
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== 'string' || !valid.has(item)) {
            throw new errors.BadRequestError({message: `${fieldName} contains invalid value`});
        }
        if (seen.has(item)) {
            throw new errors.BadRequestError({message: `${fieldName} contains duplicate value`});
        }
        seen.add(item);
    }
}

function ensureMinText(value, fieldName, min) {
    if (typeof value !== 'string' || value.trim().length < min) {
        throw new errors.BadRequestError({message: `${fieldName} must be at least ${min} characters`});
    }
}

function normalizeOther(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, 191);
}

function validateAndNormalize(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new errors.BadRequestError({message: 'Survey payload required'});
    }

    ensureOption(payload.q1_situation, Q1_OPTIONS, 'q1_situation');
    ensureOptionArray(payload.q2_reasons, Q2_OPTIONS, 'q2_reasons', {min: 1, max: 3});
    ensureOptionArray(payload.q3_top_topics, Q3_OPTIONS, 'q3_top_topics', {exact: 3});
    ensureMinText(payload.q4_blocker, 'q4_blocker', 5);
    ensureOption(payload.q5_source, Q5_OPTIONS, 'q5_source');
    ensureMinText(payload.q6_kpi, 'q6_kpi', 5);

    const q1_other = payload.q1_situation === 'other' ? normalizeOther(payload.q1_other) : null;
    const q2_other = payload.q2_reasons.includes('other') ? normalizeOther(payload.q2_other) : null;
    const q5_other = payload.q5_source === 'other' ? normalizeOther(payload.q5_other) : null;

    if (payload.q1_situation === 'other' && !q1_other) {
        throw new errors.BadRequestError({message: 'q1_other text required when q1 is other'});
    }
    if (payload.q2_reasons.includes('other') && !q2_other) {
        throw new errors.BadRequestError({message: 'q2_other text required when q2 includes other'});
    }
    if (payload.q5_source === 'other' && !q5_other) {
        throw new errors.BadRequestError({message: 'q5_other text required when q5 is other'});
    }

    return {
        q1_situation: payload.q1_situation,
        q2_reasons: JSON.stringify(payload.q2_reasons),
        q3_top_topics: JSON.stringify(payload.q3_top_topics),
        q4_blocker: payload.q4_blocker.trim().slice(0, 5000),
        q5_source: payload.q5_source,
        q6_kpi: payload.q6_kpi.trim().slice(0, 5000),
        q1_other,
        q2_other,
        q3_other: null,
        q5_other
    };
}

async function upsertRow(memberId, fields) {
    const now = db.knex.fn.now();

    const existing = await db.knex('start_here_surveys')
        .select('id')
        .where('member_id', memberId)
        .first();

    if (existing) {
        await db.knex('start_here_surveys')
            .where('id', existing.id)
            .update({
                ...fields,
                updated_at: now
            });
        return {id: existing.id, created: false};
    }

    const id = ObjectId().toHexString();
    await db.knex('start_here_surveys').insert({
        id,
        member_id: memberId,
        ...fields,
        created_at: now,
        updated_at: now
    });
    return {id, created: true};
}

async function submitSurvey(member, payload) {
    if (!await isEligibleMember(member)) {
        throw new errors.NoPermissionError({message: 'Not eligible to submit survey.'});
    }
    const memberId = getMemberId(member);
    const normalized = validateAndNormalize(payload);
    // Submitting answers clears any prior dismissal — they answered.
    return upsertRow(memberId, {
        ...normalized,
        dismissed_at: null
    });
}

async function markDismissed(member) {
    if (!await isEligibleMember(member)) {
        throw new errors.NoPermissionError({message: 'Not eligible.'});
    }
    const memberId = getMemberId(member);
    // Only stamp dismissed_at if the row doesn't already represent answers.
    const existing = await db.knex('start_here_surveys')
        .where('member_id', memberId)
        .first();

    if (existing && existing.q1_situation) {
        // They already answered — dismissal is a no-op.
        return {id: existing.id, created: false, alreadyAnswered: true};
    }

    return upsertRow(memberId, {
        q1_situation: null,
        q2_reasons: null,
        q3_top_topics: null,
        q4_blocker: null,
        q5_source: null,
        q6_kpi: null,
        q1_other: null,
        q2_other: null,
        q3_other: null,
        q5_other: null,
        dismissed_at: db.knex.fn.now()
    });
}

async function getSurveyForMember(member) {
    if (!await isEligibleMember(member)) {
        return null;
    }
    const memberId = getMemberId(member);
    const row = await db.knex('start_here_surveys')
        .where('member_id', memberId)
        .first();
    if (!row) {
        return null;
    }

    let q2 = [];
    let q3 = [];
    if (row.q2_reasons) {
        try {
            const parsed = JSON.parse(row.q2_reasons);
            if (Array.isArray(parsed)) {
                q2 = parsed;
            }
        } catch (err) { /* ignore */ }
    }
    if (row.q3_top_topics) {
        try {
            const parsed = JSON.parse(row.q3_top_topics);
            if (Array.isArray(parsed)) {
                q3 = parsed;
            }
        } catch (err) { /* ignore */ }
    }

    const answered = Boolean(row.q1_situation);
    const dismissed = Boolean(row.dismissed_at);

    return {
        // State summary — lets the frontend decide instantly without parsing fields
        state: answered ? 'answered' : (dismissed ? 'dismissed' : 'unknown'),
        answered,
        dismissed,
        // Raw fields (may be null if dismissed-only)
        q1_situation: row.q1_situation,
        q2_reasons: q2,
        q3_top_topics: q3,
        q4_blocker: row.q4_blocker,
        q5_source: row.q5_source,
        q6_kpi: row.q6_kpi,
        q1_other: row.q1_other,
        q2_other: row.q2_other,
        q3_other: row.q3_other,
        q5_other: row.q5_other,
        dismissed_at: row.dismissed_at,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function safeParseArray(value) {
    if (!value) {
        return [];
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

function tally(counterMap, key) {
    if (key === null || key === undefined || key === '') {
        return;
    }
    counterMap[key] = (counterMap[key] || 0) + 1;
}

/**
 * Aggregated analytics for the admin dashboard. Returns top-line KPIs,
 * per-question distributions, and the raw answered rows (for open-text +
 * CSV export). Admin-only — gated at the route level.
 */
async function getAnalytics() {
    const rows = await db.knex('start_here_surveys')
        .select('*')
        .orderBy('created_at', 'desc');

    const answeredRows = rows.filter(r => r.q1_situation);
    const dismissedRows = rows.filter(r => !r.q1_situation && r.dismissed_at);

    const q1 = {};
    const q2 = {};
    const q3 = {};
    const q5 = {};
    const openText = []; // Q4 + Q6 open answers with context

    answeredRows.forEach(function (r) {
        tally(q1, r.q1_situation);
        safeParseArray(r.q2_reasons).forEach(v => tally(q2, v));
        safeParseArray(r.q3_top_topics).forEach(v => tally(q3, v));
        tally(q5, r.q5_source);

        openText.push({
            member_id: r.member_id,
            q1_situation: r.q1_situation,
            q4_blocker: r.q4_blocker,
            q6_kpi: r.q6_kpi,
            created_at: r.created_at
        });
    });

    return {
        kpi: {
            shown: rows.length,
            answered: answeredRows.length,
            dismissed: dismissedRows.length,
            answer_rate: rows.length ? Math.round((answeredRows.length / rows.length) * 100) : 0,
            dismiss_rate: rows.length ? Math.round((dismissedRows.length / rows.length) * 100) : 0
        },
        distributions: {
            q1_situation: q1,
            q2_reasons: q2,
            q3_top_topics: q3,
            q5_source: q5
        },
        open_text: openText,
        raw: answeredRows.map(function (r) {
            return {
                member_id: r.member_id,
                q1_situation: r.q1_situation,
                q1_other: r.q1_other,
                q2_reasons: safeParseArray(r.q2_reasons),
                q2_other: r.q2_other,
                q3_top_topics: safeParseArray(r.q3_top_topics),
                q4_blocker: r.q4_blocker,
                q5_source: r.q5_source,
                q5_other: r.q5_other,
                q6_kpi: r.q6_kpi,
                created_at: r.created_at
            };
        })
    };
}

module.exports = {
    isEligibleMember,
    submitSurvey,
    markDismissed,
    getSurveyForMember,
    getAnalytics,
    OPTIONS: {
        q1: Array.from(Q1_OPTIONS),
        q2: Array.from(Q2_OPTIONS),
        q3: Array.from(Q3_OPTIONS),
        q5: Array.from(Q5_OPTIONS)
    }
};
