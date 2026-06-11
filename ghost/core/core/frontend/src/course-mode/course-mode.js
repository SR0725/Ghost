(function () {
    const currentScript = document.currentScript;
    const apiUrl = currentScript?.getAttribute('data-ghost-course-mode-api') || '/members/api/course-mode';
    const postUuid = currentScript?.getAttribute('data-post-uuid') || '';
    const COLLAPSED_KEY = 'gh_course_mode_collapsed';

    function injectStyles() {
        if (document.getElementById('gh-course-mode-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'gh-course-mode-styles';
        style.textContent = `
:root{--gh-course-sidebar-width:340px}
body.gh-course-mode-active{transition:padding-left .18s ease}
@media (min-width: 901px){body.gh-course-mode-active{padding-left:calc(var(--gh-course-sidebar-width) + 28px)}body.gh-course-mode-active.gh-course-mode-collapsed{padding-left:0}}
.gh-course-shell{position:fixed;inset:14px auto 14px 14px;z-index:399999;width:var(--gh-course-sidebar-width);background:#fff;color:#111317;border:1px solid rgba(17,19,23,.1);border-radius:12px;font:14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;overflow:hidden}
.gh-course-shell *{box-sizing:border-box}
.gh-course-shell__head{display:flex;align-items:center;gap:10px;min-height:60px;padding:0 16px;border-bottom:1px solid rgba(17,19,23,.08);background:#fbfbfc}
.gh-course-shell__title{min-width:0;flex:1;font-size:15px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0}
.gh-course-shell__toggle,.gh-course-mobile-toggle,.gh-course-shell__complete{border:0;cursor:pointer}
.gh-course-shell__toggle{display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;padding:0;border:1px solid rgba(17,19,23,.14);border-radius:8px;background:#fff;color:#111317;font-size:18px;line-height:1}
.gh-course-shell__progress{padding:14px 16px;border-bottom:1px solid rgba(17,19,23,.07);background:#fff}
.gh-course-shell__progress-text{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;color:#5f6773;font-size:12px;font-weight:750}
.gh-course-shell__progress-bar{height:6px;border-radius:999px;background:#e9edf2;overflow:hidden}
.gh-course-shell__progress-fill{height:100%;width:0;background:#111317}
.gh-course-shell__scroll{overflow:auto;overscroll-behavior:contain;padding-bottom:20px}
.gh-course-chapter{border-bottom:1px solid rgba(17,19,23,.07)}
.gh-course-chapter__title{padding:15px 16px 9px;color:#7a828d;font-size:12px;font-weight:850;letter-spacing:0}
.gh-course-post{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;min-height:48px;padding:9px 13px 9px 15px;color:#4b5563;text-decoration:none;border-left:3px solid transparent}
.gh-course-post:hover{background:#f5f7fa;color:#111317}
.gh-course-post.is-active{background:#eef2f7;border-left-color:#111317;color:#111317}
.gh-course-post__status{display:flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:999px;border:1px solid #c9d0d9;color:#8a94a3;font-size:13px;background:#fff;cursor:pointer;transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease}
.gh-course-post__status:hover{border-color:#111317;color:#111317;transform:scale(1.05)}
.gh-course-post.is-completed .gh-course-post__status{border-color:#111317;background:#111317;color:#fff}
.gh-course-post__title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.gh-course-shell.is-collapsed{transform:translateX(calc(-100% - 24px));pointer-events:none}
.gh-course-complete-panel{display:flex;justify-content:center;margin:42px auto 12px}
.gh-course-shell__complete{min-height:42px;padding:0 16px;border-radius:8px;background:#111317;color:#fff;font-weight:800}
.gh-course-shell__complete.is-completed{background:#e9edf2;color:#111317}
.gh-course-mobile-toggle{display:none;position:fixed;left:18px;top:18px;z-index:400000;width:42px;height:42px;align-items:center;justify-content:center;padding:0;border:1px solid rgba(17,19,23,.14);border-radius:8px;background:#fff;color:#111317;font-size:18px;line-height:1}
body.gh-course-mode-collapsed .gh-course-mobile-toggle{display:flex}
@media (max-width: 900px){body.gh-course-mode-active{padding-left:0}.gh-course-mobile-toggle{display:flex}.gh-course-shell{width:min(88vw,340px);inset:10px auto 10px 10px;transform:translateX(-110%);transition:transform .18s ease}.gh-course-shell.is-mobile-open{transform:translateX(0);pointer-events:auto}.gh-course-shell.is-collapsed{transform:translateX(-110%)}body:not(.gh-course-mode-collapsed) .gh-course-shell.is-mobile-open{transform:translateX(0)}}
`;
        document.head.appendChild(style);
    }

    function escapeHtml(value = '') {
        return String(value).replace(/[&<>"']/g, (char) => {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                '\'': '&#39;'
            }[char];
        });
    }

    async function fetchCourseMode() {
        const url = new URL(apiUrl, window.location.href);
        if (postUuid) {
            url.searchParams.set('post_uuid', postUuid);
        }
        url.searchParams.set('path', window.location.pathname);

        const response = await fetch(url.toString(), {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            return null;
        }

        return response.json();
    }

    function findArticleElement() {
        return document.querySelector('article') || document.querySelector('main');
    }

    function updateProgress(shell, data) {
        const completed = shell.querySelectorAll('.gh-course-post.is-completed').length;
        const total = shell.querySelectorAll('.gh-course-post').length;
        const percent = total ? Math.round((completed / total) * 100) : 0;
        shell.querySelector('.gh-course-shell__progress-count').textContent = `${completed}/${total}`;
        shell.querySelector('.gh-course-shell__progress-fill').style.width = `${percent}%`;
    }

    async function setProgress(completed, targetPostUuid = postUuid) {
        if (!targetPostUuid) {
            return null;
        }

        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/progress`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                post_uuid: targetPostUuid,
                completed
            })
        });

        if (!response.ok) {
            return null;
        }

        return response.json();
    }

    function setRowCompleted(shell, row, completed) {
        row.classList.toggle('is-completed', completed);
        row.querySelector('.gh-course-post__status').textContent = completed ? '✓' : '○';
        updateProgress(shell);
    }

    async function toggleRowProgress(shell, row) {
        const targetPostUuid = row.getAttribute('data-post-uuid');
        const nextCompleted = !row.classList.contains('is-completed');
        const result = await setProgress(nextCompleted, targetPostUuid);
        if (!result) {
            return;
        }
        setRowCompleted(shell, row, nextCompleted);
    }

    function renderCompleteButton(shell) {
        if (!postUuid || !shell.querySelector(`.gh-course-post[data-post-uuid="${postUuid}"]`)) {
            return;
        }

        const article = findArticleElement();
        if (!article || article.querySelector('.gh-course-complete-panel')) {
            return;
        }

        const row = shell.querySelector(`.gh-course-post[data-post-uuid="${postUuid}"]`);
        const panel = document.createElement('div');
        panel.className = 'gh-course-complete-panel';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gh-course-shell__complete';
        const syncButton = () => {
            const completed = row.classList.contains('is-completed');
            button.classList.toggle('is-completed', completed);
            button.textContent = completed ? '已完成這一課' : '標記本課已完成';
        };
        button.addEventListener('click', async () => {
            const nextCompleted = !row.classList.contains('is-completed');
            const result = await setProgress(nextCompleted);
            if (!result) {
                return;
            }
            setRowCompleted(shell, row, nextCompleted);
            syncButton();
        });
        syncButton();
        panel.appendChild(button);
        article.appendChild(panel);
    }

    function renderShell(courseMode) {
        const shell = document.createElement('aside');
        shell.className = 'gh-course-shell';
        shell.setAttribute('aria-label', 'Course navigation');

        const collapsed = window.localStorage.getItem(COLLAPSED_KEY) === '1';
        shell.classList.toggle('is-collapsed', collapsed);
        document.body.classList.toggle('gh-course-mode-collapsed', collapsed);

        shell.innerHTML = [
            '<div class="gh-course-shell__head">',
            '<div class="gh-course-shell__title">實戰攻略</div>',
            '<button class="gh-course-shell__toggle" type="button" aria-label="收合課程目錄">‹</button>',
            '</div>',
            '<div class="gh-course-shell__progress">',
            '<div class="gh-course-shell__progress-text"><span>閱讀進度</span><span class="gh-course-shell__progress-count"></span></div>',
            '<div class="gh-course-shell__progress-bar"><div class="gh-course-shell__progress-fill"></div></div>',
            '</div>',
            '<div class="gh-course-shell__scroll"></div>'
        ].join('');

        const scroll = shell.querySelector('.gh-course-shell__scroll');
        courseMode.chapters.forEach((chapter) => {
            const section = document.createElement('section');
            section.className = 'gh-course-chapter';
            section.innerHTML = `<div class="gh-course-chapter__title">${escapeHtml(chapter.name)}</div>`;
            chapter.posts.forEach((post) => {
                const link = document.createElement('a');
                link.className = [
                    'gh-course-post',
                    post.active ? 'is-active' : '',
                    post.completed ? 'is-completed' : ''
                ].filter(Boolean).join(' ');
                link.href = post.url;
                link.setAttribute('data-post-uuid', post.uuid);
                link.innerHTML = [
                    `<span class="gh-course-post__status" role="button" tabindex="0" aria-label="${post.completed ? '標記為未完成' : '標記為已完成'}">${post.completed ? '✓' : '○'}</span>`,
                    `<span class="gh-course-post__title">${escapeHtml(post.title)}</span>`
                ].join('');
                section.appendChild(link);
            });
            scroll.appendChild(section);
        });

        shell.querySelectorAll('.gh-course-post__status').forEach((status) => {
            status.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggleRowProgress(shell, status.closest('.gh-course-post'));
            });
            status.addEventListener('keydown', (event) => {
                if (!['Enter', ' '].includes(event.key)) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                toggleRowProgress(shell, status.closest('.gh-course-post'));
            });
        });

        shell.querySelector('.gh-course-shell__toggle').addEventListener('click', () => {
            const nextCollapsed = !shell.classList.contains('is-collapsed');
            shell.classList.toggle('is-collapsed', nextCollapsed);
            shell.classList.remove('is-mobile-open');
            document.body.classList.toggle('gh-course-mode-collapsed', nextCollapsed);
            window.localStorage.setItem(COLLAPSED_KEY, nextCollapsed ? '1' : '0');
        });

        const mobileToggle = document.createElement('button');
        mobileToggle.type = 'button';
        mobileToggle.className = 'gh-course-mobile-toggle';
        mobileToggle.setAttribute('aria-label', '開啟課程目錄');
        mobileToggle.textContent = '☰';
        mobileToggle.addEventListener('click', () => {
            const shouldOpen = shell.classList.contains('is-collapsed') || !shell.classList.contains('is-mobile-open');
            shell.classList.toggle('is-collapsed', false);
            document.body.classList.toggle('gh-course-mode-collapsed', false);
            window.localStorage.setItem(COLLAPSED_KEY, '0');
            shell.classList.toggle('is-mobile-open', shouldOpen);
        });

        document.body.classList.add('gh-course-mode-active');
        document.body.prepend(shell);
        document.body.appendChild(mobileToggle);
        updateProgress(shell, courseMode);
        renderCompleteButton(shell);
        setupAutoCompletion(shell);
        shell.querySelector('.gh-course-post.is-active')?.scrollIntoView({block: 'center'});
    }

    function setupAutoCompletion(shell) {
        const row = postUuid ? shell.querySelector(`.gh-course-post[data-post-uuid="${postUuid}"]`) : null;
        if (!row || row.classList.contains('is-completed')) {
            return;
        }

        let completed = false;
        const startedAt = Date.now();
        const markCurrentComplete = async () => {
            if (completed || row.classList.contains('is-completed')) {
                return;
            }
            completed = true;
            const result = await setProgress(true, postUuid);
            if (result) {
                setRowCompleted(shell, row, true);
            }
        };

        const maybeCompleteFromScroll = () => {
            if (completed || Date.now() - startedAt < 15000) {
                return;
            }

            const article = findArticleElement();
            if (!article) {
                return;
            }

            const rect = article.getBoundingClientRect();
            const articleHeight = Math.max(1, rect.height);
            const viewed = Math.min(articleHeight, window.innerHeight - rect.top);
            const viewedPercent = Math.max(0, Math.min(100, Math.round((viewed / articleHeight) * 100)));
            const nearBottom = rect.bottom <= window.innerHeight + 140;

            if (nearBottom || viewedPercent >= 92) {
                markCurrentComplete();
            }
        };

        window.addEventListener('scroll', maybeCompleteFromScroll, {passive: true});
        window.addEventListener('resize', maybeCompleteFromScroll);
        window.addEventListener('ghost:course-video-complete', (event) => {
            if (!event.detail?.postUuid || event.detail.postUuid === postUuid) {
                markCurrentComplete();
            }
        });
        window.setTimeout(maybeCompleteFromScroll, 2000);
    }

    async function init() {
        const data = await fetchCourseMode();
        const courseMode = data?.course_mode;
        if (!courseMode?.enabled || !courseMode.chapters?.length) {
            return;
        }

        injectStyles();
        renderShell(courseMode);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
