import { describe, it, expect } from 'vitest';
import { CONFIG_SCHEMA, RUNTIME_KEYS, SCHEMA_GROUPS, getVisibleSchemaItems } from '../config-schema.js';
import { ConfigManager } from '../config-manager.js';

// Copy of ALLOWED_CONFIG_KEYS from chat-theme-proxy/routes/sceneConfigRoutes.js
const PROXY_ALLOWED_CONFIG_KEYS = new Set([
  'configVersion', 'chatMode', 'bgColor', 'borderColor', 'textColor', 'usernameColor',
  'fontSize', 'fontFamily', 'fontWeight', 'chatWidth', 'chatHeight', 'maxMessages',
  'showTimestamps', 'overrideUsernameColors', 'borderRadius', 'boxShadow', 'textShadow',
  'popup', 'theme', 'lastChannel', 'showBadges', 'showPronouns', 'timestampColor',
  'pronounBadgeColor', 'badgeEndpointUrlGlobal', 'badgeEndpointUrlChannel',
  'badgeCacheGlobalTTL', 'badgeCacheChannelTTL', 'badgeFallbackHide',
  'cheermoteEndpointUrl', 'cheermoteCacheTTL', 'thirdPartyEmotes',
  'thirdPartyChannelEmotes', 'thirdPartyFilter7tvTwitchDisallowed',
  'thirdPartyFilter7tvSexual', 'thirdPartyFilter7tvEpilepsy', 'thirdPartyFilter7tvEdgy',
  'thirdPartyEmoteCacheGlobalTTL', 'thirdPartyEmoteCacheChannelTTL',
  'enlargeSingleEmotes', 'bgColorOpacity', 'bgImageOpacity', 'topFade', 'chromaKey',
  'googleFontFamily', 'bgImage', 'lastTwitchChannel', 'lastYouTubeTarget',
  'showSuperChats', 'showMembershipEvents', 'showPlatformBadges', 'preChromaKeyOpacity'
]);

describe('Config Schema Parity & Coverage', () => {
    const configManager = new ConfigManager();
    const defaults = configManager.getDefaultConfig();
    const schemaKeyMap = new Map(CONFIG_SCHEMA.map(item => [item.key, item]));

    it('every key in ConfigManager.getDefaultConfig() must appear in CONFIG_SCHEMA with matching defaults', () => {
        for (const [key, defaultValue] of Object.entries(defaults)) {
            expect(schemaKeyMap.has(key), `Key '${key}' from getDefaultConfig() missing in CONFIG_SCHEMA`).toBe(true);
            
            const schemaItem = schemaKeyMap.get(key);
            expect(schemaItem.default, `Default value mismatch for key '${key}'`).toEqual(defaultValue);
        }
    });

    it('every schema key plus RUNTIME_KEYS must equal proxy ALLOWED_CONFIG_KEYS set', () => {
        const combinedKeys = new Set([...schemaKeyMap.keys(), ...RUNTIME_KEYS]);

        // Check for missing keys in proxy
        for (const key of combinedKeys) {
            expect(PROXY_ALLOWED_CONFIG_KEYS.has(key), `Key '${key}' missing in proxy ALLOWED_CONFIG_KEYS`).toBe(true);
        }

        // Check for extra keys in proxy
        for (const key of PROXY_ALLOWED_CONFIG_KEYS) {
            expect(combinedKeys.has(key), `Proxy key '${key}' missing from combined schema & RUNTIME_KEYS`).toBe(true);
        }

        expect(combinedKeys.size).toBe(PROXY_ALLOWED_CONFIG_KEYS.size);
    });

    it('all RUNTIME_KEYS should be explicitly declared', () => {
        expect(RUNTIME_KEYS).toBeInstanceOf(Set);
        expect(RUNTIME_KEYS.size).toBeGreaterThan(0);
    });
});

describe('Config Schema - internal (non-user-facing) keys are hidden from the rendered form', () => {
    // chat-scene-creator.js's renderSchemaForm() builds each group's visible rows from
    // getVisibleSchemaItems(group.id) — the exact function under test here. This pins
    // that plumbing (cache TTLs, hardcoded Cloud Function endpoints, schema bookkeeping)
    // never gets rendered as an end-user setting, matching the original chat.html config
    // panel, which never exposed these either.
    const INTERNAL_KEYS = [
        'badgeFallbackHide', 'badgeCacheGlobalTTL', 'badgeCacheChannelTTL', 'cheermoteCacheTTL',
        'thirdPartyEmoteCacheGlobalTTL', 'thirdPartyEmoteCacheChannelTTL',
        'badgeEndpointUrlGlobal', 'badgeEndpointUrlChannel', 'cheermoteEndpointUrl',
        'lastChannel', 'configVersion'
    ];
    const schemaKeyMap = new Map(CONFIG_SCHEMA.map(item => [item.key, item]));

    it('getVisibleSchemaItems never returns an internal:true entry, for any schema group', () => {
        SCHEMA_GROUPS.forEach(group => {
            getVisibleSchemaItems(group.id).forEach(item => {
                expect(item.internal, `Key '${item.key}' is internal:true but getVisibleSchemaItems('${group.id}') returned it`).not.toBe(true);
            });
        });
    });

    it('each of the 11 known-internal keys is flagged internal:true and excluded from every group\'s visible items', () => {
        const allVisibleKeys = new Set(
            SCHEMA_GROUPS.flatMap(group => getVisibleSchemaItems(group.id).map(item => item.key))
        );

        INTERNAL_KEYS.forEach(key => {
            expect(schemaKeyMap.has(key), `'${key}' must remain in CONFIG_SCHEMA (required for parity checks above)`).toBe(true);
            expect(schemaKeyMap.get(key).internal, `'${key}' must be flagged internal: true`).toBe(true);
            expect(allVisibleKeys.has(key), `'${key}' must not be rendered into the form`).toBe(false);
        });
    });

    it('badges_cheermotes and cache_endpoints have zero visible items (their group header must not render)', () => {
        expect(getVisibleSchemaItems('badges_cheermotes')).toEqual([]);
        expect(getVisibleSchemaItems('cache_endpoints')).toEqual([]);
    });

    it('non-internal groups still have visible items (sanity check the filter is not over-hiding)', () => {
        ['theme_colors', 'typography_layout', 'message_elements', 'display_mode', 'third_party_emotes'].forEach(groupId => {
            expect(getVisibleSchemaItems(groupId).length).toBeGreaterThan(0);
        });
    });
});
