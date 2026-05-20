const ghostBookshelf = require('./base');

const PostCourseVideo = ghostBookshelf.Model.extend({
    tableName: 'post_course_videos',

    defaults: function defaults() {
        return {
            provider: 'youtube',
            access: 'public',
            enabled: false
        };
    },

    parse() {
        const attrs = ghostBookshelf.Model.prototype.parse.apply(this, arguments);

        if (typeof attrs.enabled === 'number') {
            attrs.enabled = !!attrs.enabled;
        }

        if (attrs.metadata && typeof attrs.metadata === 'string') {
            try {
                attrs.metadata = JSON.parse(attrs.metadata);
            } catch (e) {
                attrs.metadata = null;
            }
        }

        return attrs;
    },

    formatOnWrite(attrs) {
        if (attrs.metadata && typeof attrs.metadata === 'object') {
            attrs.metadata = JSON.stringify(attrs.metadata);
        }

        return attrs;
    }
}, {
    post() {
        return this.belongsTo('Post');
    }
});

module.exports = {
    PostCourseVideo: ghostBookshelf.model('PostCourseVideo', PostCourseVideo)
};
