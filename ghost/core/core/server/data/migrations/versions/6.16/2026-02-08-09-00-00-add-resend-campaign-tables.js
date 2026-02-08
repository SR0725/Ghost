const {addTable, combineNonTransactionalMigrations} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    addTable('resend_campaigns', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
        created_by_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id'},
        audience: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {isIn: [['staff_members', 'newsletter_members', 'paid_members']]}
        },
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'awaiting_confirmation',
            validations: {isIn: [['awaiting_confirmation', 'scheduled', 'running', 'completed', 'failed', 'canceled']]}
        },
        estimated_recipient_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        recipient_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        sent_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        delivered_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        opened_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        clicked_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        failed_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        progress_pct: {type: 'float', nullable: false, defaultTo: 0},
        average_read_duration_ms: {type: 'integer', nullable: true, unsigned: true},
        confirmation_token: {type: 'string', maxlength: 191, nullable: false, unique: true},
        confirmation_expires_at: {type: 'dateTime', nullable: false},
        confirmed_at: {type: 'dateTime', nullable: true},
        scheduled_for: {type: 'dateTime', nullable: true},
        last_synced_at: {type: 'dateTime', nullable: true},
        started_at: {type: 'dateTime', nullable: true},
        completed_at: {type: 'dateTime', nullable: true},
        error: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['post_id', 'created_at'],
            ['status'],
            ['audience']
        ]
    }),

    addTable('resend_campaign_batches', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        campaign_id: {type: 'string', maxlength: 24, nullable: false, references: 'resend_campaigns.id'},
        batch_index: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'pending',
            validations: {isIn: [['pending', 'submitting', 'submitted', 'failed']]}
        },
        resend_batch_id: {type: 'string', maxlength: 255, nullable: true},
        recipient_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        sent_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        failed_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        error: {type: 'string', maxlength: 2000, nullable: true},
        submitted_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['campaign_id', 'batch_index'],
            ['status']
        ]
    }),

    addTable('resend_campaign_recipients', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        campaign_id: {type: 'string', maxlength: 24, nullable: false, references: 'resend_campaigns.id'},
        batch_id: {type: 'string', maxlength: 24, nullable: true, references: 'resend_campaign_batches.id'},
        member_id: {type: 'string', maxlength: 24, nullable: true, references: 'members.id'},
        user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id'},
        email: {type: 'string', maxlength: 191, nullable: false},
        name: {type: 'string', maxlength: 191, nullable: true},
        recipient_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {isIn: [['staff_member', 'member']]}
        },
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'pending',
            validations: {isIn: [['pending', 'sent', 'delivered', 'opened', 'clicked', 'failed']]}
        },
        resend_email_id: {type: 'string', maxlength: 255, nullable: true},
        last_error: {type: 'string', maxlength: 2000, nullable: true},
        sent_at: {type: 'dateTime', nullable: true},
        delivered_at: {type: 'dateTime', nullable: true},
        opened_at: {type: 'dateTime', nullable: true},
        clicked_at: {type: 'dateTime', nullable: true},
        failed_at: {type: 'dateTime', nullable: true},
        read_duration_ms: {type: 'integer', nullable: true, unsigned: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['campaign_id', 'status'],
            ['campaign_id', 'email'],
            ['resend_email_id']
        ]
    }),

    addTable('resend_campaign_events', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        campaign_id: {type: 'string', maxlength: 24, nullable: false, references: 'resend_campaigns.id'},
        recipient_id: {type: 'string', maxlength: 24, nullable: true, references: 'resend_campaign_recipients.id'},
        event_type: {type: 'string', maxlength: 50, nullable: false},
        payload: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        occurred_at: {type: 'dateTime', nullable: false},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['campaign_id', 'occurred_at'],
            ['event_type'],
            ['recipient_id']
        ]
    })
);
