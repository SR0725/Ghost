const _ = require('lodash');
const config = require('../../../shared/config');
const BaseMapGenerator = require('./base-site-map-generator');

class PageMapGenerator extends BaseMapGenerator {
    constructor(opts) {
        super();

        this.name = 'pages';

        _.extend(this, opts);

        const excludedSlugs = opts?.excludedSlugs ?? config.get('sitemap:excludedPageSlugs') ?? [];
        this.excludedSlugs = new Set(excludedSlugs);
    }

    addUrl(url, datum) {
        if (this.excludedSlugs.has(datum?.slug)) {
            return;
        }

        return super.addUrl(url, datum);
    }
}

module.exports = PageMapGenerator;
