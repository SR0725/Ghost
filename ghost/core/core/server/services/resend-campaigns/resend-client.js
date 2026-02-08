const got = require('got');

class ResendClient {
    constructor({apiKey, baseUrl = 'https://api.resend.com'}) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    #request(path, options = {}) {
        return got(path, {
            prefixUrl: this.baseUrl,
            method: options.method || 'GET',
            responseType: 'json',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            json: options.json,
            searchParams: options.searchParams,
            timeout: {request: 20000}
        }).json();
    }

    async sendBatch(messages, idempotencyKey) {
        return this.#request('emails/batch', {
            method: 'POST',
            headers: idempotencyKey ? {'Idempotency-Key': idempotencyKey} : undefined,
            json: messages
        });
    }

    async listEmails({limit = 100, after} = {}) {
        return this.#request('emails', {
            searchParams: {
                limit,
                ...(after ? {after} : {})
            }
        });
    }
}

module.exports = ResendClient;
