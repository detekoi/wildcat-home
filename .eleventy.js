const markdownIt = require("markdown-it");

module.exports = function (eleventyConfig) {
    // Configure markdown-it with target="_blank" for external links
    const mdLib = markdownIt({
        html: true,
        linkify: true,
        typographer: true,
    });

    const defaultRender = mdLib.renderer.rules.link_open || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    mdLib.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        const hrefIndex = tokens[idx].attrIndex("href");
        if (hrefIndex >= 0) {
            const href = tokens[idx].attrs[hrefIndex][1];
            if (/^https?:\/\//i.test(href)) {
                const targetIndex = tokens[idx].attrIndex("target");
                if (targetIndex < 0) {
                    tokens[idx].attrPush(["target", "_blank"]);
                } else {
                    tokens[idx].attrs[targetIndex][1] = "_blank";
                }

                const relIndex = tokens[idx].attrIndex("rel");
                if (relIndex < 0) {
                    tokens[idx].attrPush(["rel", "noopener noreferrer"]);
                } else {
                    tokens[idx].attrs[relIndex][1] = "noopener noreferrer";
                }
            }
        }
        return defaultRender(tokens, idx, options, env, self);
    };

    eleventyConfig.setLibrary("md", mdLib);

    // Pass through static assets unchanged
    eleventyConfig.addPassthroughCopy("src/styles");
    eleventyConfig.addPassthroughCopy("src/scripts");
    eleventyConfig.addPassthroughCopy("src/assets");

    // chat-overlay static assets — the two hub pages are templated (see below),
    // so only the asset dirs are copied wholesale
    eleventyConfig.addPassthroughCopy("src/chat-overlay/css");
    eleventyConfig.addPassthroughCopy("src/chat-overlay/js");
    eleventyConfig.addPassthroughCopy("src/chat-overlay/assets");

    // Pass through favicons
    eleventyConfig.addPassthroughCopy("src/favicon.ico");
    eleventyConfig.addPassthroughCopy("src/logo192.png");
    eleventyConfig.addPassthroughCopy("src/logo512.png");

    // chat.html is the OBS browser source. It must never get the site chrome, and its
    // URL is pasted into users' OBS scenes, so it stays out of the template pipeline
    // and is copied byte-for-byte instead.
    eleventyConfig.ignores.add("src/chat-overlay/chat.html");
    eleventyConfig.addPassthroughCopy("src/chat-overlay/chat.html");

    // Date formatting filter
    eleventyConfig.addFilter("readableDate", (dateObj) => {
        return new Date(dateObj).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    });

    // ISO date filter (for <time> datetime attribute)
    eleventyConfig.addFilter("isoDate", (dateObj) => {
        return new Date(dateObj).toISOString().split("T")[0];
    });

    // Create a "posts" collection sorted newest-first
    eleventyConfig.addCollection("posts", function (collectionApi) {
        return collectionApi.getFilteredByTag("post").sort((a, b) => {
            return b.date - a.date;
        });
    });

    return {
        dir: {
            input: "src",
            output: "public",
            includes: "_includes",
        },
        markdownTemplateEngine: "njk",
        htmlTemplateEngine: "njk",
    };
};
