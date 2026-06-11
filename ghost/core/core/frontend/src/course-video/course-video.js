(function () {
    const currentScript = document.currentScript;
    const apiBase = currentScript?.getAttribute('data-ghost-course-video-api') || '/members/api/course-video/';
    const SESSION_KEY = 'gh_course_video_session_id_v2';
    const WATCH_FLUSH_INTERVAL = 30000;

    function injectStyles() {
        if (document.getElementById('gh-course-video-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'gh-course-video-styles';
        style.textContent = `
.gh-course-video{width:100%;margin:0 0 2rem;aspect-ratio:16/9;background:#0b0c0f;position:relative;overflow:hidden}
.gh-course-video[hidden]{display:none}
.gh-course-video iframe{display:block;width:100%;height:100%;border:0}
.gh-course-video__placeholder,.gh-course-video__message{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;background:#0b0c0f;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.gh-course-video__message{flex-direction:column;gap:14px}
.gh-course-video__cta{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:6px;background:#fff;color:#0b0c0f;text-decoration:none;font-weight:700}
.gh-course-video__secondary-cta{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 12px;border-radius:6px;color:#fff;text-decoration:none;font-weight:700}
.gh-course-video__preview-status{position:absolute;left:14px;bottom:14px;z-index:2;display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font:700 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
.gh-course-video__paywall{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:linear-gradient(180deg,rgba(5,6,8,.68),rgba(5,6,8,.9));color:#fff;text-align:center;font:15px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.gh-course-video__paywall-inner{display:flex;max-width:430px;flex-direction:column;align-items:center;gap:14px}
.gh-course-video__paywall-title{font-size:22px;font-weight:800;line-height:1.2}
.gh-course-video__paywall-copy{color:rgba(255,255,255,.82)}
.gh-course-video__paywall-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px}
.gh-course-video-cover{position:relative;cursor:pointer;overflow:hidden}
.gh-course-video-cover.is-playing{cursor:auto}
.gh-course-video-cover.is-playing .gh-course-video{margin:0}
.gh-course-video-cover img{display:block}
.gh-course-video-cover__button{position:absolute;left:50%;top:50%;z-index:2;display:flex;width:82px;height:82px;align-items:center;justify-content:center;border:0;border-radius:999px;background:rgba(0,0,0,.1);box-shadow:0 10px 34px rgba(0,0,0,.22);transform:translate(-50%,-50%) scale(1);transition:background-color .16s ease,transform .16s ease,box-shadow .16s ease;animation:gh-course-video-pulse .7s ease-out 1;color:#fff;pointer-events:none}
.gh-course-video-cover__button:before{content:"";display:block;width:0;height:0;margin-left:6px;border-top:17px solid transparent;border-bottom:17px solid transparent;border-left:25px solid currentColor}
.gh-course-video-cover:hover .gh-course-video-cover__button,.gh-course-video-cover:focus .gh-course-video-cover__button,.gh-course-video-cover:focus-within .gh-course-video-cover__button{background:rgba(0,0,0,.5);transform:translate(-50%,-50%) scale(1.06);box-shadow:0 14px 42px rgba(0,0,0,.34)}
.gh-course-video-cover__duration{position:absolute;right:16px;bottom:16px;z-index:2;display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:5px;background:rgba(0,0,0,.82);color:#fff;font:700 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
.gh-course-video-cover__preview{position:absolute;left:16px;bottom:16px;z-index:2;display:inline-flex;align-items:center;min-height:28px;padding:0 10px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font:700 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
@keyframes gh-course-video-pulse{0%{background:rgba(0,0,0,.1);transform:translate(-50%,-50%) scale(.94)}55%{background:rgba(0,0,0,.5);transform:translate(-50%,-50%) scale(1.08)}100%{background:rgba(0,0,0,.1);transform:translate(-50%,-50%) scale(1)}}
.gh-course-video.is-docked{position:fixed;left:24px;bottom:24px;z-index:499999;width:min(420px,calc(100vw - 48px));height:auto;box-shadow:0 18px 48px rgba(0,0,0,.28)}
.gh-course-video.is-docked:before{content:"";display:block;padding-top:56.25%}
.gh-course-video.is-docked iframe,.gh-course-video.is-docked .gh-course-video__message,.gh-course-video.is-docked .gh-course-video__placeholder,.gh-course-video.is-docked .gh-course-video__paywall{position:absolute;inset:0}
.gh-course-video__close{display:none;position:absolute;top:8px;right:8px;z-index:2;width:40px;height:40px;border:0;border-radius:999px;background:rgba(0,0,0,.64);color:#fff;cursor:pointer;font-size:20px;line-height:40px}
.gh-course-video.is-docked .gh-course-video__close{display:block}
@media (max-width: 640px){.gh-course-video.is-docked{left:12px;right:12px;bottom:12px;width:auto}}
`;
        document.head.appendChild(style);
    }

    function getSessionId() {
        try {
            const existing = window.sessionStorage.getItem(SESSION_KEY);
            if (existing && /^[a-zA-Z0-9_-]{16,64}$/.test(existing)) {
                return existing;
            }

            const bytes = new Uint8Array(16);
            window.crypto.getRandomValues(bytes);
            const sessionId = Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
            window.sessionStorage.setItem(SESSION_KEY, sessionId);
            return sessionId;
        } catch (e) {
            return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
        }
    }

    function createTracker(postUuid) {
        const sessionId = getSessionId();
        const endpoint = `${apiBase}${encodeURIComponent(postUuid)}/events`;
        const sent = new Set();
        let eventToken = null;

        const track = function (eventType, payload = {}, once = false) {
            if (!eventToken) {
                return;
            }
            if (once && sent.has(eventType)) {
                return;
            }
            if (once) {
                sent.add(eventType);
            }

            const body = JSON.stringify({
                ...payload,
                event_type: eventType,
                session_id: sessionId,
                event_token: eventToken
            });

            fetch(endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                keepalive: true,
                headers: {
                    'content-type': 'application/json'
                },
                body
            }).catch(() => {});
        };

        track.sessionId = sessionId;
        track.postUuid = postUuid;
        track.setEventToken = function (token) {
            eventToken = token;
        };

        return track;
    }

    function requiredAccessLabel(access) {
        if (access === 'paid') {
            return 'This lesson video is available to paid members.';
        }
        return 'This lesson video is available to members.';
    }

    function previewTitle(access) {
        if (access === 'paid') {
            return 'Continue watching the full lesson';
        }
        return 'Sign in to continue watching';
    }

    function previewCopy(access) {
        if (access === 'paid') {
            return 'You have reached the end of the free preview. Upgrade your membership to continue from this point.';
        }
        return 'You have reached the end of the free preview. Sign in or create a free member account to continue from this point.';
    }

    function previewPrimaryLabel(access) {
        return access === 'paid' ? 'Upgrade to continue' : 'Sign in to continue';
    }

    function previewHref(access) {
        return access === 'paid' ? '#/portal/signup/paid' : '#/portal/signup';
    }

    function isPreviewEnabled(data) {
        return data.course_video.preview?.enabled === true;
    }

    function setupDocking(mount, track) {
        let dismissed = false;
        let docked = false;
        const marker = document.createElement('div');
        marker.setAttribute('aria-hidden', 'true');
        mount.before(marker);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'gh-course-video__close';
        close.setAttribute('aria-label', 'Close video');
        close.textContent = 'x';
        close.addEventListener('click', () => {
            dismissed = true;
            docked = false;
            marker.style.height = '';
            mount.classList.remove('is-docked');
            track('close', {docked: true});
        });
        mount.appendChild(close);

        const update = () => {
            if (dismissed) {
                marker.style.height = '';
                return;
            }

            const rect = mount.classList.contains('is-docked') ? marker.getBoundingClientRect() : mount.getBoundingClientRect();
            const shouldDock = rect.bottom < 80;
            marker.style.height = shouldDock ? `${mount.offsetHeight}px` : '';
            mount.classList.toggle('is-docked', shouldDock);

            if (shouldDock !== docked) {
                docked = shouldDock;
                track(shouldDock ? 'dock' : 'undock', {docked: shouldDock});
            }
        };

        window.addEventListener('scroll', update, {passive: true});
        window.addEventListener('resize', update);
        update();
    }

    function appendQueryParams(url, params) {
        const parsed = new URL(url, window.location.href);
        Object.entries(params).forEach(([key, value]) => {
            parsed.searchParams.set(key, value);
        });
        return parsed.toString();
    }

    function formatDuration(seconds) {
        const duration = Number.parseInt(seconds, 10);

        if (!Number.isFinite(duration) || duration <= 0) {
            return '';
        }

        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const remainingSeconds = duration % 60;

        if (hours) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        }

        return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    function getFeatureImageContainer(mount) {
        const selectors = [
            'figure.article-image',
            '.article-image',
            '.post-full-image',
            '.gh-article-image',
            'article header figure',
            'header figure'
        ];
        const candidates = selectors
            .flatMap(selector => Array.from(document.querySelectorAll(selector)))
            .filter(element => element.querySelector('img'));

        if (!candidates.length) {
            return null;
        }

        const mountTop = mount.getBoundingClientRect().top + window.scrollY;
        const beforeMount = candidates.filter((element) => {
            const top = element.getBoundingClientRect().top + window.scrollY;
            return top < mountTop;
        });

        return beforeMount[beforeMount.length - 1] || candidates[0];
    }

    function decorateFeatureImage(container, durationSeconds, preview = null) {
        if (container.classList.contains('gh-course-video-cover')) {
            return;
        }

        container.classList.add('gh-course-video-cover');
        container.setAttribute('role', 'button');
        container.setAttribute('tabindex', '0');
        container.setAttribute('aria-label', 'Play course video');

        const button = document.createElement('span');
        button.className = 'gh-course-video-cover__button';
        button.setAttribute('aria-hidden', 'true');
        container.appendChild(button);

        const duration = formatDuration(durationSeconds);
        if (duration) {
            const chip = document.createElement('span');
            chip.className = 'gh-course-video-cover__duration';
            chip.textContent = duration;
            container.appendChild(chip);
        }

        if (preview?.enabled) {
            const previewChip = document.createElement('span');
            previewChip.className = 'gh-course-video-cover__preview';
            previewChip.textContent = `Free ${preview.limit_percent || 10}% preview`;
            container.appendChild(previewChip);
        }
    }

    function createIframe(data, mount, autoplay = false) {
        const iframe = document.createElement('iframe');
        const params = data.course_video.provider === 'youtube'
            ? {enablejsapi: '1', origin: window.location.origin}
            : {};

        if (autoplay) {
            if (data.course_video.provider === 'youtube') {
                params.autoplay = '1';
            } else {
                params.autoplay = 'true';
            }
        }

        iframe.src = data.course_video.provider === 'youtube'
            ? appendQueryParams(data.course_video.iframe_url, params)
            : appendQueryParams(data.course_video.iframe_url, params);
        iframe.title = data.course_video.title || mount.getAttribute('data-title') || 'Course video';
        iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;

        return iframe;
    }

    function attachCoverActivation(container, activate) {
        const onActivate = (event) => {
            if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) {
                return;
            }

            event.preventDefault();
            activate();
        };

        container.addEventListener('click', onActivate);
        container.addEventListener('keydown', onActivate);
    }

    function moveMountIntoFeatureImage(mount, sourceElement) {
        sourceElement.classList.add('is-playing');
        sourceElement.removeAttribute('role');
        sourceElement.removeAttribute('tabindex');
        sourceElement.removeAttribute('aria-label');
        sourceElement.innerHTML = '';
        sourceElement.appendChild(mount);
    }

    function loadYouTubeApi() {
        if (window.YT?.Player) {
            return Promise.resolve(window.YT);
        }

        if (window.__ghostCourseVideoYouTubeApiPromise) {
            return window.__ghostCourseVideoYouTubeApiPromise;
        }

        window.__ghostCourseVideoYouTubeApiPromise = new Promise((resolve) => {
            const previous = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof previous === 'function') {
                    previous();
                }
                resolve(window.YT);
            };

            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(script);
        });

        return window.__ghostCourseVideoYouTubeApiPromise;
    }

    function loadCloudflareStreamApi() {
        if (window.Stream) {
            return Promise.resolve(window.Stream);
        }

        if (window.__ghostCourseVideoCloudflareApiPromise) {
            return window.__ghostCourseVideoCloudflareApiPromise;
        }

        window.__ghostCourseVideoCloudflareApiPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://embed.cloudflarestream.com/embed/sdk.latest.js';
            script.onload = () => resolve(window.Stream);
            script.onerror = reject;
            document.head.appendChild(script);
        });

        return window.__ghostCourseVideoCloudflareApiPromise;
    }

    function createPlaybackTracker(track, snapshot) {
        let playingSince = null;
        let lastFlush = Date.now();
        const milestones = [25, 50, 75, 90];
        const sentMilestones = new Set();
        let interval = null;

        const flushWatch = (stop = false) => {
            if (!playingSince) {
                return;
            }

            const now = Date.now();
            const watchSeconds = Math.max(1, Math.floor((now - playingSince) / 1000));
            playingSince = stop ? null : now;
            lastFlush = now;
            track('watch', {
                ...snapshot(),
                watch_seconds: watchSeconds
            });
        };

        const tick = () => {
            if (!playingSince) {
                return;
            }

            const data = snapshot();
            milestones.forEach((milestone) => {
                if (data.progress_percent >= milestone && !sentMilestones.has(milestone)) {
                    sentMilestones.add(milestone);
                    track(`progress_${milestone}`, data, true);
                }
            });

            if (Date.now() - lastFlush >= WATCH_FLUSH_INTERVAL) {
                flushWatch();
            }
        };

        interval = window.setInterval(tick, 5000);
        window.addEventListener('pagehide', () => {
            flushWatch(true);
            window.clearInterval(interval);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                flushWatch(true);
            }
        });

        return {
            play() {
                track('play', snapshot(), true);
                playingSince = playingSince || Date.now();
                lastFlush = Date.now();
            },
            pause() {
                flushWatch(true);
            },
            ended() {
                flushWatch(true);
                const data = snapshot();
                track('complete', {
                    ...data,
                    progress_percent: 100
                }, true);
                window.dispatchEvent(new CustomEvent('ghost:course-video-complete', {
                    detail: {
                        postUuid: track.postUuid
                    }
                }));
            },
            tick
        };
    }

    function getPreviewLimitSeconds(data, duration) {
        if (!isPreviewEnabled(data)) {
            return null;
        }

        const percent = Number.parseInt(data.course_video.preview.limit_percent, 10) || 10;
        const resolvedDuration = duration || Number.parseInt(data.course_video.duration_seconds, 10);

        if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0) {
            return null;
        }

        return Math.max(1, Math.floor((resolvedDuration * percent) / 100));
    }

    function renderPreviewPaywall(mount, data, track, replay) {
        const requiredAccess = data.course_video.preview?.required_access || data.course_video.access;
        const href = previewHref(requiredAccess);
        const paywall = document.createElement('div');
        paywall.className = 'gh-course-video__paywall';
        paywall.innerHTML = [
            '<div class="gh-course-video__paywall-inner">',
            `<div class="gh-course-video__paywall-title">${previewTitle(requiredAccess)}</div>`,
            `<div class="gh-course-video__paywall-copy">${previewCopy(requiredAccess)}</div>`,
            '<div class="gh-course-video__paywall-actions">',
            `<a class="gh-course-video__cta" href="${href}">${previewPrimaryLabel(requiredAccess)}</a>`,
            '<button class="gh-course-video__secondary-cta" type="button">Replay preview</button>',
            '</div>',
            '</div>'
        ].join('');

        mount.querySelector('.gh-course-video__paywall')?.remove();
        mount.appendChild(paywall);
        track('preview_complete', {reason: requiredAccess}, true);
        track('cta_view', {reason: requiredAccess}, true);
        paywall.querySelector('.gh-course-video__cta')?.addEventListener('click', () => {
            track('cta_click', {reason: requiredAccess}, true);
        });
        paywall.querySelector('.gh-course-video__secondary-cta')?.addEventListener('click', () => {
            paywall.remove();
            replay();
        });
    }

    function createPreviewGate(data, mount, track, controls) {
        if (!isPreviewEnabled(data)) {
            return {
                tick() {}
            };
        }

        const status = document.createElement('div');
        status.className = 'gh-course-video__preview-status';
        status.textContent = `Free ${data.course_video.preview.limit_percent || 10}% preview`;
        mount.appendChild(status);

        let gated = false;
        let started = false;

        const update = () => {
            if (gated) {
                controls.pause();
                return;
            }

            const duration = controls.getDuration();
            const position = controls.getPosition();
            const limit = getPreviewLimitSeconds(data, duration);

            if (!limit) {
                return;
            }

            if (!started && position > 0) {
                started = true;
                track('preview_start', {
                    playback_position_seconds: position,
                    duration_seconds: duration,
                    progress_percent: duration > 0 ? Math.min(100, Math.floor((position / duration) * 100)) : null
                }, true);
            }

            status.textContent = `${formatDuration(Math.max(limit - position, 0)) || '0:00'} preview left`;

            if (position >= limit) {
                gated = true;
                controls.pause();
                controls.seek(limit);
                renderPreviewPaywall(mount, data, track, () => {
                    gated = false;
                    controls.seek(0);
                    controls.play();
                });
            }
        };

        return {
            tick: update
        };
    }

    function setupYouTubeTracking(iframe, track, data, mount) {
        loadYouTubeApi().then((YT) => {
            let player;
            const playback = createPlaybackTracker(track, () => {
                const duration = Math.floor(player?.getDuration?.() || 0);
                const position = Math.floor(player?.getCurrentTime?.() || 0);
                const progress = duration > 0 ? Math.min(100, Math.floor((position / duration) * 100)) : null;
                return {
                    playback_position_seconds: position,
                    duration_seconds: duration,
                    progress_percent: progress
                };
            });
            let previewGate = null;
            player = new YT.Player(iframe, {
                events: {
                    onReady() {
                        previewGate = createPreviewGate(data, mount, track, {
                            getDuration: () => Math.floor(player?.getDuration?.() || 0),
                            getPosition: () => Math.floor(player?.getCurrentTime?.() || 0),
                            pause: () => player?.pauseVideo?.(),
                            play: () => player?.playVideo?.(),
                            seek: position => player?.seekTo?.(position, true)
                        });
                    },
                    onStateChange(event) {
                        if (event.data === YT.PlayerState.PLAYING) {
                            playback.play();
                        }

                        if (event.data === YT.PlayerState.PAUSED) {
                            playback.pause();
                        }

                        if (event.data === YT.PlayerState.ENDED) {
                            playback.ended();
                        }
                        previewGate?.tick();
                    }
                }
            });
            window.setInterval(() => previewGate?.tick(), 1000);
        }).catch(() => {
            track('error', {reason: 'youtube_api_unavailable'}, true);
        });
    }

    function setupCloudflareStreamTracking(iframe, track, data, mount) {
        loadCloudflareStreamApi().then((Stream) => {
            const player = Stream(iframe);
            const playback = createPlaybackTracker(track, () => {
                const duration = Math.floor(player.duration || 0);
                const position = Math.floor(player.currentTime || 0);
                const progress = duration > 0 ? Math.min(100, Math.floor((position / duration) * 100)) : null;
                return {
                    playback_position_seconds: position,
                    duration_seconds: duration,
                    progress_percent: progress
                };
            });
            const previewGate = createPreviewGate(data, mount, track, {
                getDuration: () => Math.floor(player.duration || 0),
                getPosition: () => Math.floor(player.currentTime || 0),
                pause: () => player.pause?.(),
                play: () => player.play?.(),
                seek: position => {
                    player.currentTime = position;
                }
            });

            player.addEventListener('play', () => playback.play());
            player.addEventListener('playing', () => playback.play());
            player.addEventListener('pause', () => playback.pause());
            player.addEventListener('ended', () => playback.ended());
            player.addEventListener('timeupdate', () => {
                playback.tick();
                previewGate.tick();
            });
            player.addEventListener('error', () => {
                track('error', {reason: 'cloudflare_stream_error'}, true);
            });
        }).catch(() => {
            track('error', {reason: 'cloudflare_stream_api_unavailable'}, true);
        });
    }

    function renderLockedMessage(mount, requiredAccess, track) {
        const href = requiredAccess === 'paid' ? '#/portal/signup/paid' : '#/portal/signup';
        mount.innerHTML = [
            `<div class="gh-course-video__message">`,
            `<div>${requiredAccessLabel(requiredAccess)}</div>`,
            `<a class="gh-course-video__cta" href="${href}">Unlock lesson</a>`,
            `</div>`
        ].join('');
        track('cta_view', {reason: requiredAccess}, true);
        mount.querySelector('.gh-course-video__cta')?.addEventListener('click', () => {
            track('cta_click', {reason: requiredAccess}, true);
        });
    }

    function startPlayback(mount, data, track, sourceElement = null) {
        const iframe = createIframe(data, mount, true);

        mount.hidden = false;
        mount.innerHTML = '';
        mount.appendChild(iframe);

        if (sourceElement) {
            moveMountIntoFeatureImage(mount, sourceElement);
        }

        if (isPreviewEnabled(data)) {
            track('unauthorized', {reason: data.course_video.preview.required_access}, true);
        } else {
            track('authorized', {}, true);
        }
        setupDocking(mount, track);

        if (data.course_video.provider === 'youtube') {
            setupYouTubeTracking(iframe, track, data, mount);
        } else if (data.course_video.provider === 'cloudflare_stream') {
            setupCloudflareStreamTracking(iframe, track, data, mount);
        }
    }

    function renderCoverLaunch(mount, data, track) {
        const cover = getFeatureImageContainer(mount);

        if (!cover) {
            startPlayback(mount, data, track);
            return;
        }

        decorateFeatureImage(cover, data.course_video.duration_seconds, data.course_video.preview);
        mount.hidden = true;

        attachCoverActivation(cover, () => {
            startPlayback(mount, data, track, cover);
        });
    }

    function renderLockedCover(mount, requiredAccess, track) {
        const cover = getFeatureImageContainer(mount);

        if (!cover) {
            renderLockedMessage(mount, requiredAccess, track);
            return;
        }

        decorateFeatureImage(cover);
        mount.hidden = true;

        attachCoverActivation(cover, () => {
            mount.hidden = false;
            renderLockedMessage(mount, requiredAccess, track);
            moveMountIntoFeatureImage(mount, cover);
        });
    }

    async function renderMount(mount) {
        const postUuid = mount.getAttribute('data-post-uuid');
        const track = createTracker(postUuid);

        let response = await fetch(`${apiBase}${encodeURIComponent(postUuid)}`, {
            credentials: 'same-origin',
            headers: {
                'x-ghost-course-video-session': track.sessionId
            }
        });

        if (response.status === 409) {
            response = await fetch(`${apiBase}${encodeURIComponent(postUuid)}`, {
                credentials: 'same-origin',
                headers: {
                    'x-ghost-course-video-session': track.sessionId
                }
            });
        }

        if (response.status === 403) {
            const data = await response.json().catch(() => null);
            const error = data?.errors?.[0] || {};
            const requiredAccess = error.required_access;
            track.setEventToken(error.event_token);
            track('impression', {}, true);
            track('unauthorized', {reason: requiredAccess}, true);
            renderLockedCover(mount, requiredAccess, track);
            return;
        }

        if (!response.ok) {
            track('error', {reason: `http_${response.status}`}, true);
            mount.innerHTML = '<div class="gh-course-video__message">This lesson video is unavailable.</div>';
            return;
        }

        const data = await response.json();
        track.setEventToken(data.course_video.event_token);
        track('impression', {}, true);
        renderCoverLaunch(mount, data, track);
    }

    function init() {
        const mounts = document.querySelectorAll('.gh-course-video[data-post-uuid]');
        if (!mounts.length) {
            return;
        }

        injectStyles();
        mounts.forEach((mount) => {
            renderMount(mount).catch(() => {
                const postUuid = mount.getAttribute('data-post-uuid');
                createTracker(postUuid)('error', {reason: 'render_failed'}, true);
                mount.innerHTML = '<div class="gh-course-video__message">This lesson video is unavailable.</div>';
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
