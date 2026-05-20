(function () {
    const currentScript = document.currentScript;
    const apiBase = currentScript?.getAttribute('data-ghost-course-video-api') || '/members/api/course-video/';

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
.gh-course-video.is-docked{position:fixed;left:24px;bottom:24px;z-index:499999;width:min(420px,calc(100vw - 48px));height:auto;box-shadow:0 18px 48px rgba(0,0,0,.28)}
.gh-course-video.is-docked:before{content:"";display:block;padding-top:56.25%}
.gh-course-video.is-docked iframe,.gh-course-video.is-docked .gh-course-video__message,.gh-course-video.is-docked .gh-course-video__placeholder{position:absolute;inset:0}
.gh-course-video__close{display:none;position:absolute;top:8px;right:8px;z-index:2;width:40px;height:40px;border:0;border-radius:999px;background:rgba(0,0,0,.64);color:#fff;cursor:pointer;font-size:20px;line-height:40px}
.gh-course-video.is-docked .gh-course-video__close{display:block}
@media (max-width: 640px){.gh-course-video.is-docked{left:12px;right:12px;bottom:12px;width:auto}}
`;
        document.head.appendChild(style);
    }

    function requiredAccessLabel(access) {
        if (access === 'paid') {
            return 'This lesson video is available to paid members.';
        }
        return 'This lesson video is available to members.';
    }

    function setupDocking(mount) {
        let dismissed = false;
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
            mount.classList.remove('is-docked');
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
        };

        window.addEventListener('scroll', update, {passive: true});
        window.addEventListener('resize', update);
        update();
    }

    async function renderMount(mount) {
        const postUuid = mount.getAttribute('data-post-uuid');
        const response = await fetch(`${apiBase}${encodeURIComponent(postUuid)}`, {
            credentials: 'same-origin'
        });

        if (response.status === 403) {
            const data = await response.json().catch(() => null);
            mount.innerHTML = `<div class="gh-course-video__message">${requiredAccessLabel(data?.errors?.[0]?.required_access)}</div>`;
            return;
        }

        if (!response.ok) {
            mount.innerHTML = '<div class="gh-course-video__message">This lesson video is unavailable.</div>';
            return;
        }

        const data = await response.json();
        const iframe = document.createElement('iframe');
        iframe.src = data.course_video.iframe_url;
        iframe.title = data.course_video.title || mount.getAttribute('data-title') || 'Course video';
        iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;

        mount.innerHTML = '';
        mount.appendChild(iframe);
        setupDocking(mount);
    }

    function init() {
        const mounts = document.querySelectorAll('.gh-course-video[data-post-uuid]');
        if (!mounts.length) {
            return;
        }

        injectStyles();
        mounts.forEach((mount) => {
            renderMount(mount).catch(() => {
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
