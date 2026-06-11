const fs = require('node:fs/promises');
const path = require('node:path');
const {render} = require('../ghost/core/node_modules/@tryghost/kg-markdown-html-renderer');

const GHOST_URL = process.env.GHOST_URL || 'http://localhost:2368';
const ADMIN_BASE = `${GHOST_URL.replace(/\/$/, '')}/ghost/api/admin`;
const OWNER_EMAIL = process.env.GHOST_LOCAL_ADMIN_EMAIL || 'local-admin@example.com';
const OWNER_PASSWORD = process.env.GHOST_LOCAL_ADMIN_PASSWORD || 'RayDevAdmin2026!v9-Only-For-This-Local-Site';

const draftPaths = [
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-23-harness-engineering.md',
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-23-gbrain-personal-ai.md',
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-23-coding-agents-comparison.md',
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-23-codex-goals.md',
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-23-claude-codex-blog-pipeline.md',
    '/Users/sr0725/Desktop/personal-system/projects/blog/drafts/2026-05-22-five-ai-tools-comparison.md'
];

class GhostClient {
    constructor() {
        this.cookies = new Map();
    }

    cookieHeader() {
        return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    }

    storeCookies(headers) {
        const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
        for (const cookie of setCookie) {
            const [pair] = cookie.split(';');
            const separator = pair.indexOf('=');
            if (separator !== -1) {
                this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
            }
        }
    }

    async request(url, options = {}) {
        const headers = new Headers(options.headers || {});
        headers.set('Origin', GHOST_URL.replace(/\/$/, ''));
        headers.set('Referer', `${GHOST_URL.replace(/\/$/, '')}/ghost/`);
        if (this.cookies.size) {
            headers.set('Cookie', this.cookieHeader());
        }
        const res = await fetch(url, {...options, headers});
        this.storeCookies(res.headers);
        return res;
    }

    async json(url, options = {}) {
        const headers = new Headers(options.headers || {});
        if (options.body && !headers.has('Content-Type') && !(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const res = await this.request(url, {...options, headers});
        const text = await res.text();
        const data = text && /^[\[{]/.test(text.trim()) ? JSON.parse(text) : {};

        if (!res.ok) {
            const message = data.errors?.[0]?.message || res.statusText;
            const context = data.errors?.[0]?.context;
            throw new Error(`${res.status} ${message}${context ? ` (${context})` : ''}`);
        }

        return data;
    }

    async ensureSetup() {
        const data = await this.json(`${ADMIN_BASE}/authentication/setup/`);
        if (data.setup?.[0]?.status) {
            return;
        }

        await this.json(`${ADMIN_BASE}/authentication/setup/`, {
            method: 'POST',
            body: JSON.stringify({
                setup: [{
                    name: 'Local Admin',
                    email: OWNER_EMAIL,
                    password: OWNER_PASSWORD,
                    blogTitle: 'Ray Blog',
                    description: 'AI, engineering, and personal systems'
                }]
            })
        });
    }

    async login() {
        const res = await this.request(`${ADMIN_BASE}/session/`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                grant_type: 'password',
                username: OWNER_EMAIL,
                password: OWNER_PASSWORD
            })
        });

        if (res.ok) {
            return;
        }

        const text = await res.text();
        const data = text && /^[\[{]/.test(text.trim()) ? JSON.parse(text) : {};
        const needsVerification = res.status === 403 && /verification code/i.test(data.errors?.[0]?.context || data.errors?.[0]?.message || '');
        if (!needsVerification) {
            const message = data.errors?.[0]?.message || res.statusText;
            throw new Error(`${res.status} ${message}`);
        }

        const token = await getLatestVerificationCode();
        await this.json(`${ADMIN_BASE}/session/verify`, {
            method: 'PUT',
            body: JSON.stringify({token})
        });
    }

    async uploadImage(filePath, ref) {
        const bytes = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        const form = new FormData();
        form.append('file', new Blob([bytes], {type}), path.basename(filePath));
        form.append('purpose', 'image');
        form.append('ref', ref);

        const data = await this.json(`${ADMIN_BASE}/images/upload/`, {
            method: 'POST',
            body: form
        });

        return data.images[0].url;
    }

    async findPostBySlug(slug) {
        const res = await this.request(`${ADMIN_BASE}/posts/slug/${slug}/?formats=html`);
        if (res.status === 404) {
            return null;
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : {};
        if (!res.ok) {
            const message = data.errors?.[0]?.message || res.statusText;
            throw new Error(`${res.status} ${message}`);
        }
        return data.posts[0];
    }

    async upsertPost(post) {
        const existing = await this.findPostBySlug(post.slug);
        if (!existing) {
            const data = await this.json(`${ADMIN_BASE}/posts/?source=html&formats=html`, {
                method: 'POST',
                body: JSON.stringify({posts: [post]})
            });
            return {action: 'created', post: data.posts[0]};
        }

        const data = await this.json(`${ADMIN_BASE}/posts/${existing.id}/?source=html&formats=html`, {
            method: 'PUT',
            body: JSON.stringify({
                posts: [{
                    ...post,
                    id: existing.id,
                    updated_at: existing.updated_at
                }]
            })
        });
        return {action: 'updated', post: data.posts[0]};
    }
}

async function getLatestVerificationCode() {
    const res = await fetch('http://localhost:8025/api/v1/messages');
    if (!res.ok) {
        throw new Error(`Could not read Mailpit messages: ${res.status}`);
    }
    const data = await res.json();
    const message = data.messages.find((item) => item.To?.some((to) => to.Address === OWNER_EMAIL) && /verification code/i.test(item.Subject));
    const token = message?.Subject?.match(/\b(\d{6})\b/)?.[1];
    if (!token) {
        throw new Error('Could not find Ghost verification code in Mailpit');
    }
    return token;
}

function parseDraft(raw, filePath) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    const frontmatter = {};
    let markdown = raw;

    if (match) {
        markdown = raw.slice(match[0].length);
        for (const line of match[1].split('\n')) {
            const separator = line.indexOf(':');
            if (separator !== -1) {
                const key = line.slice(0, separator).trim();
                const value = line.slice(separator + 1).trim().replace(/^"|"$/g, '');
                frontmatter[key] = value;
            }
        }
    }

    const title = frontmatter.title || markdown.match(/^#\s+(.+)$/m)?.[1] || path.basename(filePath, '.md');
    markdown = markdown.replace(new RegExp(`^#\\s+${escapeRegExp(title)}\\s*\\n+`), '');

    return {
        title,
        status: frontmatter.status || 'draft',
        createdAt: frontmatter.created_at,
        markdown
    };
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugFromPath(filePath) {
    return path.basename(filePath, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function preparePost(client, filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    const draft = parseDraft(raw, filePath);
    const dir = path.dirname(filePath);
    const slug = slugFromPath(filePath);
    const imageMap = new Map();

    const imagePattern = /!\[([^\]]*)\]\((\.\/[^)]+)\)/g;
    const matches = [...draft.markdown.matchAll(imagePattern)];
    for (const match of matches) {
        const localRef = match[2];
        const absolute = path.resolve(dir, localRef);
        if (!imageMap.has(localRef)) {
            imageMap.set(localRef, await client.uploadImage(absolute, `${slug}/${path.basename(absolute)}`));
        }
    }

    let markdown = draft.markdown.replace(imagePattern, (full, alt, localRef) => {
        const url = imageMap.get(localRef);
        return url ? `![${alt}](${url})` : full;
    });

    const featureCandidates = [
        path.resolve(dir, `${path.basename(filePath, '.md')}-assets/feature-image.png`),
        path.resolve(dir, `${path.basename(filePath, '.md')}-assets/image-01-cover.png`)
    ];
    let featureImage = null;
    for (const candidate of featureCandidates) {
        if (await fileExists(candidate)) {
            featureImage = await client.uploadImage(candidate, `${slug}/feature-${path.basename(candidate)}`);
            break;
        }
    }

    return {
        title: draft.title,
        slug,
        html: render(markdown),
        status: draft.status,
        feature_image: featureImage,
        created_at: draft.createdAt ? `${draft.createdAt}T00:00:00.000Z` : undefined
    };
}

async function main() {
    const client = new GhostClient();
    await client.ensureSetup();
    await client.login();

    const results = [];
    for (const filePath of draftPaths) {
        const post = await preparePost(client, filePath);
        const result = await client.upsertPost(post);
        results.push({
            action: result.action,
            title: result.post.title,
            slug: result.post.slug,
            url: result.post.url
        });
    }

    console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
