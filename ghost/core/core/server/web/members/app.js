const debug = require('@tryghost/debug')('members');
const bodyParser = require('body-parser');
const express = require('../../../shared/express');
const sentry = require('../../../shared/sentry');
const membersService = require('../../services/members');
const stripeService = require('../../services/stripe');
const middleware = membersService.middleware;
const shared = require('../shared');
const errorHandler = require('@tryghost/mw-error-handler');
const config = require('../../../shared/config');
const settingsCache = require('../../../shared/settings-cache');
const {http} = require('@tryghost/api-framework');
const api = require('../../api').endpoints;

const commentRouter = require('../comments');
const announcementRouter = require('../announcement');
const corsMiddleware = require('./middleware/cors');
const courseVideos = require('../../services/course-videos');
const courseMode = require('../../services/course-mode');
const startHereSurvey = require('../../services/start-here-survey');

/**
 * @returns {import('express').Application}
 */
module.exports = function setupMembersApp() {
    debug('Members App setup start');
    const membersApp = express('members');

    // Members API shouldn't be cached
    membersApp.use(shared.middleware.cacheControl('private'));

    // Support CORS for requests from the frontend
    membersApp.use(corsMiddleware);

    // Currently global handling for signing in with ?token= magiclinks
    membersApp.use(middleware.createSessionFromMagicLink);

    // Routing

    // Webhooks
    membersApp.post('/webhooks/stripe', bodyParser.raw({type: 'application/json'}), stripeService.webhookController.handle.bind(stripeService.webhookController));

    // Initializes members specific routes as well as assigns members specific data to the req/res objects
    // We don't want to add global bodyParser middleware as that interferes with stripe webhook requests on - `/webhooks`.

    // Manage newsletter subscription via unsubscribe link - these should be authenticated by uuid and hashed key
    membersApp.get('/api/member/newsletters',
        middleware.authMemberByUuid,
        middleware.getMemberNewsletters
    );
    membersApp.put('/api/member/newsletters',
        bodyParser.json({limit: '50mb'}),
        middleware.authMemberByUuid,
        middleware.updateMemberNewsletters
    );

    // Get and update member data
    // Caching members content is an experimental feature
    const shouldCacheMembersContent = config.get('cacheMembersContent:enabled');
    if (shouldCacheMembersContent) {
        membersApp.get('/api/member', middleware.loadMemberSession, middleware.accessInfoSession, middleware.getMemberData);
    } else {
        membersApp.get('/api/member', middleware.getMemberData);
    }

    membersApp.put('/api/member', bodyParser.json({limit: '50mb'}), middleware.updateMemberData);
    membersApp.post('/api/member/email', bodyParser.json({limit: '50mb'}), (req, res, next) => membersService.api.middleware.updateEmailAddress(req, res, next));

    // Member offers (retention etc.)
    membersApp.post('/api/member/offers', bodyParser.json(), function lazyGetMemberOffersMw(req, res, next) {
        return membersService.api.middleware.getMemberOffers(req, res, next);
    });

    // Remove email from suppression list
    membersApp.delete('/api/member/suppression', middleware.deleteSuppression);

    // Manage session
    membersApp.get('/api/session', middleware.getIdentityToken);
    membersApp.delete('/api/session', bodyParser.json({limit: '5mb'}), middleware.deleteSession);

    membersApp.get('/api/entitlements', middleware.getEntitlementToken);
    membersApp.get('/api/integrity-token', middleware.createIntegrityToken);

    membersApp.post(
        '/api/send-magic-link',
        bodyParser.json(),
        middleware.verifyIntegrityToken,
        // Prevent brute forcing email addresses (user enumeration)
        shared.middleware.brute.membersAuthEnumeration,
        // Prevent brute forcing passwords for the same email address
        shared.middleware.brute.membersAuth,
        // NOTE: this is wrapped in a function to ensure we always go via the getter
        function lazySendMagicLinkMw(req, res, next) {
            return membersService.api.middleware.sendMagicLink(req, res, next);
        }
    );
    membersApp.post(
        '/api/verify-otc',
        bodyParser.json(),
        middleware.verifyIntegrityToken,
        shared.middleware.brute.otcVerificationEnumeration,
        shared.middleware.brute.otcVerification,
        // NOTE: this is wrapped in a function to ensure we always go via the getter
        function lazyVerifyOTCMw(req, res, next) {
            return membersService.api.middleware.verifyOTC(req, res, next);
        }
    );
    membersApp.post('/api/create-stripe-checkout-session', function lazyCreateCheckoutSessionMw(req, res, next) {
        return membersService.api.middleware.createCheckoutSession(req, res, next);
    });
    membersApp.post('/api/create-stripe-update-session', function lazyCreateCheckoutSetupSessionMw(req, res, next) {
        return membersService.api.middleware.createCheckoutSetupSession(req, res, next);
    });
    membersApp.post('/api/create-stripe-billing-portal-session', function lazyCreateBillingPortalSessionMw(req, res, next) {
        return membersService.api.middleware.createBillingPortalSession(req, res, next);
    });
    membersApp.put('/api/subscriptions/:id', function lazyUpdateSubscriptionMw(req, res, next) {
        return membersService.api.middleware.updateSubscription(req, res, next);
    });
    membersApp.post('/api/subscriptions/:id/apply-offer', function lazyApplyOfferMw(req, res, next) {
        return membersService.api.middleware.applyOfferToSubscription(req, res, next);
    });

    // Comments
    membersApp.use('/api/comments', commentRouter());

    // Feedback
    membersApp.post(
        '/api/feedback',
        bodyParser.json({limit: '50mb'}),
        middleware.loadMemberSession,
        middleware.authMemberByUuid,
        http(api.feedbackMembers.add)
    );

    // Gifts
    membersApp.get(
        '/api/gifts/:token/redeem',
        middleware.loadMemberSession,
        http(api.giftsMembers.getRedeemable)
    );
    membersApp.post(
        '/api/gifts/:token/redeem',
        bodyParser.json({limit: '50mb'}),
        middleware.loadMemberSession,
        http(api.giftsMembers.redeem)
    );

    // Announcement
    membersApp.use(
        '/api/announcement',
        middleware.loadMemberSession,
        announcementRouter()
    );

    // Recommendations
    membersApp.post(
        '/api/recommendations/:id/clicked',
        middleware.loadMemberSession,
        http(api.recommendationsPublic.trackClicked)
    );

    // Recommendations
    membersApp.post(
        '/api/recommendations/:id/subscribed',
        middleware.loadMemberSession,
        http(api.recommendationsPublic.trackSubscribed)
    );

    // Allow external systems to read public settings via the members api
    // Without CORS issues and without a required integration token
    // 1. Detect if a site is Running Ghost
    // 2. For recommendations to know when we can offer 'one-click-subscribe' to know if members are enabled
    // Why not content API? Domain can be different from recommended domain + CORS issues
    membersApp.get('/api/site', http(api.site.read));

    membersApp.get('/api/course-video/:post_uuid', middleware.loadMemberSession, async function getCourseVideo(req, res, next) {
        try {
            if (!settingsCache.get('course_video_enabled')) {
                res.writeHead(404);
                return res.end();
            }

            const courseVideo = await courseVideos.getCourseVideoForPostUuid(req.params.post_uuid);
            const browserSession = courseVideos.ensureBrowserSessionCookie(req, res);
            if (!browserSession) {
                res.writeHead(409, {'Content-Type': 'application/json'});
                return res.end(JSON.stringify({
                    errors: [{
                        message: 'Course video session initialized. Retry the request.',
                        retry: true
                    }]
                }));
            }

            const authorized = courseVideos.hasAccess(courseVideo, req.member);
            const preview = courseVideos.getPreview(courseVideo, req.member);
            const eventToken = courseVideos.getCourseVideoEventToken(courseVideo, req.get('x-ghost-course-video-session'), browserSession);

            if (!authorized) {
                res.writeHead(403, {'Content-Type': 'application/json'});
                return res.end(JSON.stringify({
                    errors: [{
                        message: 'This course video requires additional access.',
                        required_access: courseVideo.access,
                        preview,
                        event_token: eventToken
                    }]
                }));
            }

            const iframeUrl = await courseVideos.getIframeUrl(courseVideo);
            const durationSeconds = await courseVideos.getVideoDuration(courseVideo);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                course_video: {
                    provider: courseVideo.provider,
                    title: courseVideo.title,
                    access: courseVideo.access,
                    iframe_url: iframeUrl,
                    duration_seconds: durationSeconds,
                    event_token: eventToken,
                    authorized,
                    preview
                }
            }));
        } catch (err) {
            next(err);
        }
    });

    membersApp.get('/api/course-mode', middleware.loadMemberSession, async function getCourseMode(req, res, next) {
        try {
            const catalog = await courseMode.getCatalog(req.member, {
                post_uuid: req.query.post_uuid,
                current_path: req.query.path
            });

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                course_mode: catalog
            }));
        } catch (err) {
            next(err);
        }
    });

    membersApp.put('/api/course-mode/progress', bodyParser.json({limit: '20kb'}), middleware.loadMemberSession, async function updateCourseModeProgress(req, res, next) {
        try {
            const progress = await courseMode.setProgress(req.member, req.body);

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                course_post_progress: progress
            }));
        } catch (err) {
            next(err);
        }
    });

    membersApp.post('/api/course-video/:post_uuid/events', bodyParser.json({limit: '20kb'}), middleware.loadMemberSession, async function trackCourseVideoEvent(req, res, next) {
        try {
            if (!settingsCache.get('course_video_enabled')) {
                res.writeHead(404);
                return res.end();
            }

            const result = await courseVideos.recordEventForPostUuid(req.params.post_uuid, req.member, req.body, courseVideos.getBrowserSessionFromRequest(req));

            res.writeHead(result.created ? 201 : 200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                course_video_event: result
            }));
        } catch (err) {
            next(err);
        }
    });

    /* Start Here 訂閱問卷 — 三個 endpoint。
       Gate 順序：必須有 session（401）→ 必須是 eligible（paid + start-here 標籤，403）→ 才動作。 */

    async function requireEligibleMember(req, res) {
        if (!req.member) {
            res.writeHead(401, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({errors: [{message: 'Sign in required'}]}));
            return false;
        }
        if (!await startHereSurvey.isEligibleMember(req.member)) {
            res.writeHead(403, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({errors: [{message: 'Not eligible for Start Here survey'}]}));
            return false;
        }
        return true;
    }

    membersApp.get('/api/start-here-survey', middleware.loadMemberSession, async function getStartHereSurvey(req, res, next) {
        try {
            if (!await requireEligibleMember(req, res)) {
                return;
            }
            const survey = await startHereSurvey.getSurveyForMember(req.member);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({start_here_survey: survey}));
        } catch (err) {
            next(err);
        }
    });

    membersApp.post('/api/start-here-survey', bodyParser.json({limit: '20kb'}), middleware.loadMemberSession, async function postStartHereSurvey(req, res, next) {
        try {
            if (!await requireEligibleMember(req, res)) {
                return;
            }
            const result = await startHereSurvey.submitSurvey(req.member, req.body);
            res.writeHead(result.created ? 201 : 200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({start_here_survey: result}));
        } catch (err) {
            next(err);
        }
    });

    membersApp.post('/api/start-here-survey/dismiss', middleware.loadMemberSession, async function dismissStartHereSurvey(req, res, next) {
        try {
            if (!await requireEligibleMember(req, res)) {
                return;
            }
            const result = await startHereSurvey.markDismissed(req.member);
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({start_here_survey: result}));
        } catch (err) {
            next(err);
        }
    });

    // API error handling
    membersApp.use('/api', errorHandler.resourceNotFound);
    membersApp.use('/api', errorHandler.handleJSONResponse(sentry));

    // Webhook error handling
    membersApp.use('/webhooks', errorHandler.resourceNotFound);
    membersApp.use('/webhooks', errorHandler.handleJSONResponse(sentry));

    debug('Members App setup end');

    return membersApp;
};
