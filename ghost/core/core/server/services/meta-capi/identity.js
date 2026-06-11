const crypto = require('node:crypto');

function normalize(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }
    const value = input.trim().toLowerCase();
    return value || null;
}

function hash(input) {
    const value = normalize(input);
    return value ? crypto.createHash('sha256').update(value).digest('hex') : null;
}

function compact(object) {
    return Object.fromEntries(Object.entries(object).filter(([, value]) => {
        if (Array.isArray(value)) {
            return value.length > 0;
        }
        return value !== null && value !== undefined && value !== '';
    }));
}

function buildUserData({email, name, externalId, fbp, fbc, clientIpAddress, clientUserAgent}) {
    const [firstName, ...rest] = (name || '').trim().split(/\s+/).filter(Boolean);
    const lastName = rest.length ? rest.join(' ') : null;
    const emailHash = hash(email);

    return compact({
        em: emailHash ? [emailHash] : undefined,
        fn: hash(firstName),
        ln: hash(lastName),
        external_id: hash(externalId),
        fbp,
        fbc,
        client_ip_address: clientIpAddress,
        client_user_agent: clientUserAgent
    });
}

module.exports = {
    buildUserData,
    compact,
    hash
};
