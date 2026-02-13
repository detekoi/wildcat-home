module.exports = function (eleventyConfig) {
    // Pass through static assets unchanged
    eleventyConfig.addPassthroughCopy("src/styles");
    eleventyConfig.addPassthroughCopy("src/scripts");
    eleventyConfig.addPassthroughCopy("src/assets");

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
