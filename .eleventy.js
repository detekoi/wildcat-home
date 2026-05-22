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
    eleventyConfig.addPassthroughCopy("src/chat-overlay");
    
    // Pass through favicons
    eleventyConfig.addPassthroughCopy("src/favicon.ico");
    eleventyConfig.addPassthroughCopy("src/logo192.png");
    eleventyConfig.addPassthroughCopy("src/logo512.png");

    // Exclude chat-overlay from template processing — it's a standalone static app
    eleventyConfig.ignores.add("src/chat-overlay/**");

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
