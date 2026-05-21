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
.gh-course-video iframe{display:block;width:100%;height:100%;border:0}
.gh-course-video__placeholder,.gh-course-video__message{display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;background:#0b0c0f;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.gh-course-video__message{flex-direction:column;gap:14px}
.gh-course-video__cta{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border-radius:6px;background:#fff;color:#0b0c0f;text-decoration:none;font-weight:700}
.gh-course-video.is-docked{position:fixed;left:24px;bottom:24px;z-index:499999;width:min(420px,calc(100vw - 48px));height:auto;box-shadow:0 18px 48px rgba(0,0,0,.28)}
.gh-course-video.is-docked:before{content:"";display:block;padding-top:56.25%}
.gh-course-video.is-docked iframe,.gh-course-video.is-docked .gh-course-video__message,.gh-course-video.is-docked .gh-course-video__placeholder{position:absolute;inset:0}
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
            },
            tick
        };
    }

    function setupYouTubeTracking(iframe, track) {
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
            player = new YT.Player(iframe, {
                events: {
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
                    }
                }
            });
        }).catch(() => {
            track('error', {reason: 'youtube_api_unavailable'}, true);
        });
    }

    function setupCloudflareStreamTracking(iframe, track) {
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

            player.addEventListener('play', () => playback.play());
            player.addEventListener('playing', () => playback.play());
            player.addEventListener('pause', () => playback.pause());
            player.addEventListener('ended', () => playback.ended());
            player.addEventListener('timeupdate', () => playback.tick());
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
            renderLockedMessage(mount, requiredAccess, track);
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
        const iframe = document.createElement('iframe');
        iframe.src = data.course_video.provider === 'youtube'
            ? appendQueryParams(data.course_video.iframe_url, {enablejsapi: '1', origin: window.location.origin})
            : data.course_video.iframe_url;
        iframe.title = data.course_video.title || mount.getAttribute('data-title') || 'Course video';
        iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;

        mount.innerHTML = '';
        mount.appendChild(iframe);
        track('authorized', {}, true);
        setupDocking(mount, track);

        if (data.course_video.provider === 'youtube') {
            setupYouTubeTracking(iframe, track);
        } else if (data.course_video.provider === 'cloudflare_stream') {
            setupCloudflareStreamTracking(iframe, track);
        }
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
