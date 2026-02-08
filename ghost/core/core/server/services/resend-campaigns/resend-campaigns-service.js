const crypto = require('crypto');
const ObjectID = require('bson-objectid').default;
const moment = require('moment-timezone');
const {BadRequestError, NotFoundError} = require('@tryghost/errors');
const logging = require('@tryghost/logging');

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1100;
const TAIPEI_TZ = 'Asia/Taipei';

const AUDIENCES = {
    staff_members: 'staff_members',
    newsletter_members: 'newsletter_members',
    paid_members: 'paid_members'
};

const STATUS = {
    AWAITING_CONFIRMATION: 'awaiting_confirmation',
    SCHEDULED: 'scheduled',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled'
};

class ResendCampaignsService {
    constructor({
        models,
        db,
        config,
        jobsService,
        resendClientFactory
    }) {
        this.models = models;
        this.db = db;
        this.config = config;
        this.jobsService = jobsService;
        this.resendClientFactory = resendClientFactory;
    }

    init() {
        if (process.env.NODE_ENV.startsWith('test')) {
            return;
        }

        const s = Math.floor(Math.random() * 60);

        this.jobsService.addJob({
            name: 'resend-campaigns-scheduler',
            job: require('path').resolve(__dirname, 'jobs/process-scheduled.js'),
            at: `${s} * * * * *`
        });
    }

    #validateAudience(audience) {
        if (!Object.values(AUDIENCES).includes(audience)) {
            throw new BadRequestError({
                message: 'Invalid audience value.'
            });
        }
    }

    async #getPostOrThrow(postId) {
        const post = await this.models.Post.findOne({id: postId, status: 'all'});

        if (!post) {
            throw new NotFoundError({message: 'Post not found.'});
        }

        if (post.get('status') !== 'published') {
            throw new BadRequestError({
                message: 'Resend campaigns can only be sent after the post is published.'
            });
        }

        return post;
    }

    #getResendConfig() {
        const resendConfig = this.config.get('bulkEmail')?.resend;

        if (!resendConfig?.apiKey || !resendConfig?.from) {
            throw new BadRequestError({
                message: 'Resend is not configured. Please set bulkEmail.resend.apiKey and bulkEmail.resend.from.'
            });
        }

        return resendConfig;
    }

    async #fetchAudienceRecipients(audience) {
        const knex = this.db.knex;
        this.#validateAudience(audience);

        let rows = [];

        if (audience === AUDIENCES.staff_members) {
            rows = await knex('users')
                .select('id', 'email', 'name')
                .whereNotNull('email')
                .where('status', 'active');

            return this.#dedupeRecipients(rows.map(row => ({
                userId: row.id,
                email: row.email,
                name: row.name || null,
                recipientType: 'staff_member'
            })));
        }

        if (audience === AUDIENCES.newsletter_members) {
            rows = await knex('members as m')
                .join('members_newsletters as mn', 'mn.member_id', 'm.id')
                .select('m.id', 'm.email', 'm.name')
                .whereNotNull('m.email')
                .where('m.email_disabled', 0)
                .whereIn('m.status', ['free', 'paid', 'comped'])
                .distinct('m.id');

            return this.#dedupeRecipients(rows.map(row => ({
                memberId: row.id,
                email: row.email,
                name: row.name || null,
                recipientType: 'member'
            })));
        }

        rows = await knex('members')
            .select('id', 'email', 'name')
            .whereNotNull('email')
            .where('email_disabled', 0)
            .whereIn('status', ['paid', 'comped']);

        return this.#dedupeRecipients(rows.map(row => ({
            memberId: row.id,
            email: row.email,
            name: row.name || null,
            recipientType: 'member'
        })));
    }

    #dedupeRecipients(recipients) {
        const seen = new Set();
        const result = [];

        for (const recipient of recipients) {
            const email = String(recipient.email || '').trim().toLowerCase();
            if (!email || seen.has(email)) {
                continue;
            }

            seen.add(email);
            result.push({...recipient, email});
        }

        return result;
    }

    async estimateRecipients({postId, audience}) {
        await this.#getPostOrThrow(postId);
        const recipients = await this.#fetchAudienceRecipients(audience);

        return {
            audience,
            recipient_count: recipients.length
        };
    }

    #parseScheduledAtTaipei(scheduledAtTaipei) {
        if (!scheduledAtTaipei) {
            return null;
        }

        const m = moment.tz(scheduledAtTaipei, TAIPEI_TZ);

        if (!m.isValid()) {
            throw new BadRequestError({message: 'Invalid scheduled_at_taipei value.'});
        }

        return m.utc().toDate();
    }

    async createCampaign({postId, audience, createdById, scheduledAtTaipei}) {
        await this.#getPostOrThrow(postId);
        this.#validateAudience(audience);

        const recipients = await this.#fetchAudienceRecipients(audience);

        if (recipients.length === 0) {
            throw new BadRequestError({
                message: 'No eligible recipients for the selected audience.'
            });
        }

        const now = new Date();
        const confirmationToken = crypto.randomBytes(24).toString('hex');
        const scheduledForUtc = this.#parseScheduledAtTaipei(scheduledAtTaipei);

        const campaign = {
            id: new ObjectID().toHexString(),
            post_id: postId,
            created_by_id: createdById,
            audience,
            status: STATUS.AWAITING_CONFIRMATION,
            estimated_recipient_count: recipients.length,
            recipient_count: 0,
            sent_count: 0,
            delivered_count: 0,
            opened_count: 0,
            clicked_count: 0,
            failed_count: 0,
            progress_pct: 0,
            confirmation_token: confirmationToken,
            confirmation_expires_at: new Date(now.getTime() + (1000 * 60 * 15)),
            scheduled_for: scheduledForUtc,
            created_at: now,
            updated_at: now
        };

        await this.db.knex('resend_campaigns').insert(campaign);

        return {
            id: campaign.id,
            audience: campaign.audience,
            status: campaign.status,
            estimated_recipient_count: campaign.estimated_recipient_count,
            confirmation_token: campaign.confirmation_token,
            confirmation_expires_at: campaign.confirmation_expires_at,
            scheduled_for: campaign.scheduled_for
        };
    }

    async #getCampaignForPost({postId, campaignId}) {
        const campaign = await this.db.knex('resend_campaigns')
            .where({id: campaignId, post_id: postId})
            .first();

        if (!campaign) {
            throw new NotFoundError({message: 'Resend campaign not found.'});
        }

        return campaign;
    }

    async confirmCampaign({postId, campaignId, confirmationToken}) {
        const campaign = await this.#getCampaignForPost({postId, campaignId});

        if (campaign.status !== STATUS.AWAITING_CONFIRMATION) {
            throw new BadRequestError({message: 'This campaign is no longer awaiting confirmation.'});
        }

        if (campaign.confirmation_token !== confirmationToken) {
            throw new BadRequestError({message: 'Invalid confirmation token.'});
        }

        if (new Date(campaign.confirmation_expires_at).getTime() < Date.now()) {
            throw new BadRequestError({message: 'Confirmation token has expired.'});
        }

        const scheduledFor = campaign.scheduled_for ? new Date(campaign.scheduled_for) : null;
        const shouldSchedule = scheduledFor && scheduledFor.getTime() > Date.now();
        const status = shouldSchedule ? STATUS.SCHEDULED : STATUS.RUNNING;

        await this.db.knex('resend_campaigns')
            .where({id: campaign.id})
            .update({
                status,
                confirmed_at: new Date(),
                started_at: shouldSchedule ? null : new Date(),
                updated_at: new Date()
            });

        if (!shouldSchedule) {
            await this.enqueueCampaignJob(campaign.id);
        }

        return this.readCampaign({postId, campaignId});
    }

    async enqueueCampaignJob(campaignId) {
        return this.jobsService.addJob({
            name: `resend-campaign-${campaignId}`,
            job: this.campaignJob.bind(this),
            data: {campaignId},
            offloaded: false
        });
    }

    #chunk(list, size) {
        const chunks = [];
        for (let i = 0; i < list.length; i += size) {
            chunks.push(list.slice(i, i + size));
        }
        return chunks;
    }

    async #insertRecipients({campaignId, recipients, trx}) {
        if (!recipients.length) {
            return [];
        }

        const now = new Date();
        const rows = recipients.map((recipient) => {
            return {
                id: new ObjectID().toHexString(),
                campaign_id: campaignId,
                member_id: recipient.memberId || null,
                user_id: recipient.userId || null,
                email: recipient.email,
                name: recipient.name || null,
                recipient_type: recipient.recipientType,
                status: 'pending',
                created_at: now,
                updated_at: now
            };
        });

        await trx('resend_campaign_recipients').insert(rows);

        return rows;
    }

    async #buildCampaignPayload({campaign, post, recipients}) {
        const resendConfig = this.#getResendConfig();
        const subject = post.get('email_subject') || post.get('title') || 'New post';
        const html = post.get('html') || `<h1>${post.get('title') || 'New post'}</h1>`;
        const text = post.get('plaintext') || post.get('title') || 'New post';

        return recipients.map((recipient) => {
            return {
                from: resendConfig.from,
                to: [recipient.email],
                subject,
                html,
                text,
                ...(resendConfig.replyTo ? {reply_to: resendConfig.replyTo} : {}),
                tags: [
                    {name: 'campaign_id', value: campaign.id},
                    {name: 'recipient_id', value: recipient.id}
                ]
            };
        });
    }

    #toRecipientStatus(lastEvent) {
        switch (lastEvent) {
        case 'clicked':
            return 'clicked';
        case 'opened':
            return 'opened';
        case 'delivered':
            return 'delivered';
        case 'bounced':
        case 'complained':
            return 'failed';
        default:
            return 'sent';
        }
    }

    async #updateAggregates(campaignId, trx = this.db.knex) {
        const statsRows = await trx('resend_campaign_recipients')
            .where({campaign_id: campaignId})
            .select('status')
            .count({count: '* as count'})
            .groupBy('status');

        const stats = {
            recipient_count: 0,
            sent_count: 0,
            delivered_count: 0,
            opened_count: 0,
            clicked_count: 0,
            failed_count: 0
        };

        for (const row of statsRows) {
            const count = Number(row.count || 0);
            stats.recipient_count += count;

            if (row.status === 'sent' || row.status === 'delivered' || row.status === 'opened' || row.status === 'clicked') {
                stats.sent_count += count;
            }
            if (row.status === 'delivered' || row.status === 'opened' || row.status === 'clicked') {
                stats.delivered_count += count;
            }
            if (row.status === 'opened' || row.status === 'clicked') {
                stats.opened_count += count;
            }
            if (row.status === 'clicked') {
                stats.clicked_count += count;
            }
            if (row.status === 'failed') {
                stats.failed_count += count;
            }
        }

        const progressPct = stats.recipient_count > 0
            ? Math.round(((stats.sent_count + stats.failed_count) / stats.recipient_count) * 10000) / 100
            : 0;

        await trx('resend_campaigns')
            .where({id: campaignId})
            .update({
                ...stats,
                progress_pct: progressPct,
                updated_at: new Date()
            });
    }

    async campaignJob({campaignId}) {
        const campaign = await this.db.knex('resend_campaigns').where({id: campaignId}).first();

        if (!campaign || campaign.status !== STATUS.RUNNING) {
            return;
        }

        const post = await this.#getPostOrThrow(campaign.post_id);
        const resendClient = this.resendClientFactory();

        try {
            let recipients = await this.db.knex('resend_campaign_recipients')
                .where({campaign_id: campaignId})
                .orderBy('created_at', 'asc');

            if (recipients.length === 0) {
                const sourceRecipients = await this.#fetchAudienceRecipients(campaign.audience);

                if (sourceRecipients.length === 0) {
                    throw new Error('No eligible recipients at send time.');
                }

                await this.db.knex.transaction(async (trx) => {
                    const inserted = await this.#insertRecipients({campaignId, recipients: sourceRecipients, trx});

                    await trx('resend_campaigns')
                        .where({id: campaignId})
                        .update({
                            recipient_count: inserted.length,
                            started_at: campaign.started_at || new Date(),
                            updated_at: new Date()
                        });
                });

                recipients = await this.db.knex('resend_campaign_recipients')
                    .where({campaign_id: campaignId})
                    .orderBy('created_at', 'asc');
            }

            const chunks = this.#chunk(recipients, BATCH_SIZE);

            for (let i = 0; i < chunks.length; i += 1) {
                const batchRecipients = chunks[i];
                const now = new Date();
                const batchId = new ObjectID().toHexString();

                await this.db.knex('resend_campaign_batches').insert({
                    id: batchId,
                    campaign_id: campaignId,
                    batch_index: i,
                    status: 'submitting',
                    recipient_count: batchRecipients.length,
                    sent_count: 0,
                    failed_count: 0,
                    created_at: now,
                    updated_at: now
                });

                try {
                    const payload = await this.#buildCampaignPayload({campaign, post, recipients: batchRecipients});
                    const idempotencyKey = `campaign-${campaignId}-batch-${i}`;
                    const response = await resendClient.sendBatch(payload, idempotencyKey);
                    const responseData = response?.data || [];

                    for (let idx = 0; idx < batchRecipients.length; idx += 1) {
                        const recipient = batchRecipients[idx];
                        const resendEmailId = responseData[idx]?.id || null;

                        await this.db.knex('resend_campaign_recipients')
                            .where({id: recipient.id})
                            .update({
                                batch_id: batchId,
                                resend_email_id: resendEmailId,
                                status: resendEmailId ? 'sent' : 'failed',
                                sent_at: resendEmailId ? new Date() : null,
                                failed_at: resendEmailId ? null : new Date(),
                                last_error: resendEmailId ? null : 'Missing resend email id in batch response.',
                                updated_at: new Date()
                            });
                    }

                    const sentCount = responseData.filter(item => item && item.id).length;

                    await this.db.knex('resend_campaign_batches')
                        .where({id: batchId})
                        .update({
                            status: sentCount === batchRecipients.length ? 'submitted' : 'failed',
                            sent_count: sentCount,
                            failed_count: batchRecipients.length - sentCount,
                            submitted_at: new Date(),
                            updated_at: new Date()
                        });
                } catch (err) {
                    await this.db.knex('resend_campaign_recipients')
                        .whereIn('id', batchRecipients.map(r => r.id))
                        .update({
                            batch_id: batchId,
                            status: 'failed',
                            failed_at: new Date(),
                            last_error: err.message,
                            updated_at: new Date()
                        });

                    await this.db.knex('resend_campaign_batches')
                        .where({id: batchId})
                        .update({
                            status: 'failed',
                            sent_count: 0,
                            failed_count: batchRecipients.length,
                            error: err.message,
                            updated_at: new Date()
                        });
                }

                await this.#updateAggregates(campaignId);

                if (i !== chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }

            await this.#updateAggregates(campaignId);

            await this.db.knex('resend_campaigns')
                .where({id: campaignId})
                .update({
                    status: STATUS.COMPLETED,
                    completed_at: new Date(),
                    progress_pct: 100,
                    updated_at: new Date()
                });
        } catch (err) {
            logging.error(err);
            await this.db.knex('resend_campaigns')
                .where({id: campaignId})
                .update({
                    status: STATUS.FAILED,
                    error: err.message,
                    completed_at: new Date(),
                    updated_at: new Date()
                });
        }
    }

    async processScheduledCampaigns() {
        const now = new Date();

        const dueCampaigns = await this.db.knex('resend_campaigns')
            .where({status: STATUS.SCHEDULED})
            .whereNotNull('scheduled_for')
            .where('scheduled_for', '<=', now)
            .select('id');

        for (const campaign of dueCampaigns) {
            await this.db.knex('resend_campaigns')
                .where({id: campaign.id})
                .update({
                    status: STATUS.RUNNING,
                    started_at: new Date(),
                    updated_at: new Date()
                });

            await this.enqueueCampaignJob(campaign.id);
        }

        return {count: dueCampaigns.length};
    }

    async browseCampaignsForPost({postId, limit = 20, page = 1}) {
        await this.#getPostOrThrow(postId);
        const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
        const pageNumber = Math.max(Number(page) || 1, 1);
        const offset = (pageNumber - 1) * pageSize;

        const [rows, totalResult] = await Promise.all([
            this.db.knex('resend_campaigns')
                .where({post_id: postId})
                .orderBy('created_at', 'desc')
                .limit(pageSize)
                .offset(offset),
            this.db.knex('resend_campaigns')
                .where({post_id: postId})
                .count({count: '* as count'})
                .first()
        ]);

        const total = Number(totalResult?.count || 0);

        return {
            resend_campaigns: rows,
            meta: {
                pagination: {
                    page: pageNumber,
                    limit: pageSize,
                    pages: Math.ceil(total / pageSize),
                    total
                }
            }
        };
    }

    async readCampaign({postId, campaignId}) {
        await this.#getPostOrThrow(postId);
        const campaign = await this.#getCampaignForPost({postId, campaignId});

        return {
            resend_campaigns: [campaign]
        };
    }

    async browseRecipients({postId, campaignId, limit = 100, page = 1}) {
        await this.#getPostOrThrow(postId);
        await this.#getCampaignForPost({postId, campaignId});

        const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 200);
        const pageNumber = Math.max(Number(page) || 1, 1);
        const offset = (pageNumber - 1) * pageSize;

        const [rows, totalResult] = await Promise.all([
            this.db.knex('resend_campaign_recipients')
                .where({campaign_id: campaignId})
                .orderBy('created_at', 'asc')
                .limit(pageSize)
                .offset(offset),
            this.db.knex('resend_campaign_recipients')
                .where({campaign_id: campaignId})
                .count({count: '* as count'})
                .first()
        ]);

        const total = Number(totalResult?.count || 0);

        return {
            resend_campaign_recipients: rows,
            meta: {
                pagination: {
                    page: pageNumber,
                    limit: pageSize,
                    pages: Math.ceil(total / pageSize),
                    total
                }
            }
        };
    }

    async syncCampaign({postId, campaignId}) {
        await this.#getPostOrThrow(postId);
        await this.#getCampaignForPost({postId, campaignId});

        const resendClient = this.resendClientFactory();

        const recipients = await this.db.knex('resend_campaign_recipients')
            .where({campaign_id: campaignId})
            .whereNotNull('resend_email_id');

        const map = new Map(recipients.map(recipient => [recipient.resend_email_id, recipient]));

        let hasMore = true;
        let after = null;
        let page = 0;
        const maxPages = 30;

        while (hasMore && map.size > 0 && page < maxPages) {
            page += 1;
            const response = await resendClient.listEmails({limit: 100, after});
            const data = response?.data || [];

            if (!data.length) {
                break;
            }

            for (const item of data) {
                const recipient = map.get(item.id);

                if (!recipient) {
                    continue;
                }

                const mappedStatus = this.#toRecipientStatus(item.last_event);

                const patch = {
                    status: mappedStatus,
                    updated_at: new Date()
                };

                if (mappedStatus === 'delivered' && !recipient.delivered_at) {
                    patch.delivered_at = new Date(item.created_at || new Date());
                }
                if (mappedStatus === 'opened' && !recipient.opened_at) {
                    patch.opened_at = new Date(item.created_at || new Date());
                }
                if (mappedStatus === 'clicked' && !recipient.clicked_at) {
                    patch.clicked_at = new Date(item.created_at || new Date());
                }
                if (mappedStatus === 'failed' && !recipient.failed_at) {
                    patch.failed_at = new Date();
                }

                await this.db.knex('resend_campaign_recipients')
                    .where({id: recipient.id})
                    .update(patch);

                map.delete(item.id);
            }

            hasMore = Boolean(response?.has_more);
            after = data[data.length - 1]?.id || null;
        }

        await this.#updateAggregates(campaignId);

        await this.db.knex('resend_campaigns')
            .where({id: campaignId})
            .update({
                last_synced_at: new Date(),
                updated_at: new Date()
            });

        return this.readCampaign({postId, campaignId});
    }

    async exportRecipientsCsv({postId, campaignId}) {
        await this.#getPostOrThrow(postId);
        await this.#getCampaignForPost({postId, campaignId});

        const rows = await this.db.knex('resend_campaign_recipients')
            .where({campaign_id: campaignId})
            .orderBy('created_at', 'asc');

        const header = [
            'email',
            'name',
            'recipient_type',
            'status',
            'sent_at',
            'delivered_at',
            'opened_at',
            'clicked_at',
            'failed_at',
            'read_duration_ms',
            'last_error',
            'resend_email_id'
        ];

        const escapeCsv = (value) => {
            const text = value === null || value === undefined ? '' : String(value);
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                return `"${text.replace(/"/g, '""')}"`;
            }
            return text;
        };

        const lines = [header.join(',')];

        for (const row of rows) {
            lines.push([
                row.email,
                row.name,
                row.recipient_type,
                row.status,
                row.sent_at,
                row.delivered_at,
                row.opened_at,
                row.clicked_at,
                row.failed_at,
                row.read_duration_ms,
                row.last_error,
                row.resend_email_id
            ].map(escapeCsv).join(','));
        }

        return lines.join('\n');
    }
}

module.exports = {
    ResendCampaignsService,
    AUDIENCES,
    STATUS,
    TAIPEI_TZ
};
