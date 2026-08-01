/**
 * Config Schema Definition
 * Single source of truth for chat overlay configuration metadata.
 */

export const RUNTIME_KEYS = new Set([
    'bgImage',
    'googleFontFamily',
    'lastTwitchChannel',
    'lastYouTubeTarget',
    'preChromaKeyOpacity',
    'showSuperChats',
    'showMembershipEvents',
    'showPlatformBadges'
]);

/**
 * Visible (non-internal) schema items for a given group, in schema order.
 * This is the single source of truth the form renderer (chat-scene-creator.js)
 * uses to decide what to draw — keep it in sync with any group/`internal`
 * changes above rather than re-filtering CONFIG_SCHEMA ad hoc elsewhere.
 * @param {string} groupId
 * @returns {Array<Object>}
 */
export function getVisibleSchemaItems(groupId) {
    return CONFIG_SCHEMA.filter(item => item.group === groupId && !item.internal);
}

export const SCHEMA_GROUPS = [
    { id: 'theme_colors', label: 'Theme & Colors', expanded: true },
    { id: 'typography_layout', label: 'Typography & Layout', expanded: true },
    { id: 'message_elements', label: 'Message Elements', expanded: true },
    { id: 'display_mode', label: 'Display Mode', expanded: true },
    { id: 'third_party_emotes', label: 'Third-party emote filters', advanced: true },
    { id: 'badges_cheermotes', label: 'Badges & cheermotes', advanced: true },
    { id: 'cache_endpoints', label: 'Cache & endpoints', advanced: true }
];

export const CONFIG_SCHEMA = [
    // --- Theme & Colors ---
    {
        key: 'theme',
        group: 'theme_colors',
        label: 'Theme Preset',
        control: 'select',
        options: [
            { label: 'Default', value: 'default' },
            { label: 'Dark', value: 'dark' },
            { label: 'Light', value: 'light' },
            { label: 'Dracula', value: 'dracula' },
            { label: 'Cyberpunk', value: 'cyberpunk' },
            { label: 'Nord', value: 'nord' },
            { label: 'Monokai', value: 'monokai' },
            { label: 'Sunset', value: 'sunset' },
            { label: 'Forest', value: 'forest' }
        ],
        default: 'default'
    },
    {
        key: 'bgColor',
        group: 'theme_colors',
        label: 'Background Color',
        control: 'color',
        default: '#121212'
    },
    {
        key: 'bgColorOpacity',
        group: 'theme_colors',
        label: 'Background Opacity',
        control: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        scale: 100,
        default: 0.8
    },
    {
        key: 'bgImageOpacity',
        group: 'theme_colors',
        label: 'Background Image Opacity',
        control: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        scale: 100,
        default: 0.55
    },
    {
        key: 'chromaKey',
        group: 'theme_colors',
        label: 'Chroma Key Mode',
        control: 'checkbox',
        default: false
    },
    {
        key: 'borderColor',
        group: 'theme_colors',
        label: 'Border Color',
        control: 'color',
        default: '#9147ff'
    },
    {
        key: 'textColor',
        group: 'theme_colors',
        label: 'Text Color',
        control: 'color',
        default: '#efeff1'
    },
    {
        key: 'usernameColor',
        group: 'theme_colors',
        label: 'Username Color',
        control: 'color',
        default: '#9147ff'
    },
    {
        key: 'timestampColor',
        group: 'theme_colors',
        label: 'Timestamp Color',
        control: 'color',
        default: '#adadb8'
    },
    {
        key: 'pronounBadgeColor',
        group: 'theme_colors',
        label: 'Pronoun Badge Color',
        control: 'color',
        default: '#adadb8'
    },
    {
        key: 'overrideUsernameColors',
        group: 'theme_colors',
        label: 'Override User Colors',
        control: 'checkbox',
        default: false
    },

    // --- Typography & Layout ---
    {
        key: 'fontFamily',
        group: 'typography_layout',
        label: 'Font Family',
        control: 'font',
        default: "'Inter', 'Helvetica Neue', Arial, sans-serif"
    },
    {
        key: 'fontSize',
        group: 'typography_layout',
        label: 'Font Size (px)',
        control: 'range',
        min: 10,
        max: 40,
        step: 1,
        default: 14
    },
    {
        key: 'fontWeight',
        group: 'typography_layout',
        label: 'Font Weight',
        control: 'select',
        options: [
            { label: 'Normal', value: 'normal' },
            { label: 'Bold', value: 'bold' },
            { label: 'Medium (500)', value: '500' },
            { label: 'Semi-Bold (600)', value: '600' },
            { label: 'Bold (700)', value: '700' },
            { label: 'Extra Bold (800)', value: '800' }
        ],
        default: 'normal'
    },
    {
        key: 'borderRadius',
        group: 'typography_layout',
        label: 'Border Radius',
        control: 'presets',
        options: [
            { label: '0px', value: '0px' },
            { label: '8px', value: '8px' },
            { label: '16px', value: '16px' },
            { label: '24px', value: '24px' }
        ],
        default: '8px'
    },
    {
        key: 'boxShadow',
        group: 'typography_layout',
        label: 'Box Shadow',
        control: 'presets',
        options: [
            { label: 'None', value: 'none' },
            { label: 'Soft', value: 'soft' },
            { label: 'Simple 3D', value: 'simple3d' },
            { label: 'Intense 3D', value: 'intense3d' },
            { label: 'Sharp', value: 'sharp' }
        ],
        default: 'none'
    },
    {
        key: 'textShadow',
        group: 'typography_layout',
        label: 'Text Shadow',
        control: 'presets',
        options: [
            { label: 'None', value: 'none' },
            { label: 'Soft', value: 'soft' },
            { label: 'Sharp', value: 'sharp' },
            { label: 'Outline', value: 'outline' },
            { label: 'Strong', value: 'strong' },
            { label: 'Glow', value: 'glow' }
        ],
        default: 'none'
    },
    {
        key: 'chatWidth',
        group: 'typography_layout',
        label: 'Chat Width (%)',
        control: 'range',
        min: 20,
        max: 100,
        step: 1,
        default: 95
    },
    {
        key: 'chatHeight',
        group: 'typography_layout',
        label: 'Chat Height (%)',
        control: 'range',
        min: 20,
        max: 100,
        step: 1,
        default: 95
    },

    // --- Message Elements ---
    {
        key: 'showTimestamps',
        group: 'message_elements',
        label: 'Show Timestamps',
        control: 'checkbox',
        default: true
    },
    {
        key: 'showBadges',
        group: 'message_elements',
        label: 'Show User Badges',
        control: 'checkbox',
        default: true
    },
    {
        key: 'showPronouns',
        group: 'message_elements',
        label: 'Show User Pronouns',
        control: 'checkbox',
        default: true
    },
    {
        key: 'enlargeSingleEmotes',
        group: 'message_elements',
        label: 'Enlarge Single Emotes',
        control: 'checkbox',
        default: false
    },
    {
        key: 'topFade',
        group: 'message_elements',
        label: 'Top Gradient Fade',
        control: 'checkbox',
        default: false
    },

    // --- Display Mode ---
    {
        key: 'chatMode',
        group: 'display_mode',
        label: 'Chat Mode',
        control: 'select',
        options: [
            { label: 'Window (Continuous)', value: 'window' },
            { label: 'Popup (Transient)', value: 'popup' }
        ],
        default: 'window'
    },
    {
        key: 'maxMessages',
        group: 'display_mode',
        label: 'Max Messages (Window Mode)',
        control: 'number',
        min: 1,
        max: 200,
        step: 1,
        default: 50
    },
    {
        key: 'popup',
        group: 'display_mode',
        label: 'Popup Mode Configuration',
        control: 'popup_group',
        default: {
            direction: 'from-bottom',
            duration: 5,
            maxMessages: 3
        },
        subFields: [
            {
                key: 'direction',
                label: 'Popup Animation Direction',
                control: 'select',
                options: [
                    { label: 'From Bottom', value: 'from-bottom' },
                    { label: 'From Top', value: 'from-top' },
                    { label: 'Fade In', value: 'fade-in' }
                ],
                default: 'from-bottom'
            },
            {
                key: 'duration',
                label: 'Message Duration (seconds)',
                control: 'number',
                min: 2,
                max: 60,
                step: 1,
                default: 5
            },
            {
                key: 'maxMessages',
                label: 'Max Popup Messages',
                control: 'number',
                min: 1,
                max: 10,
                step: 1,
                default: 3
            }
        ]
    },

    // --- Third-party Emote Filters ---
    {
        key: 'thirdPartyEmotes',
        group: 'third_party_emotes',
        label: 'Third-Party Emotes (Master)',
        control: 'checkbox',
        default: true,
        advanced: true
    },
    {
        key: 'thirdPartyChannelEmotes',
        group: 'third_party_emotes',
        label: 'Channel 7TV/BTTV/FFZ Emotes',
        control: 'checkbox',
        default: true,
        advanced: true
    },
    {
        key: 'thirdPartyFilter7tvTwitchDisallowed',
        group: 'third_party_emotes',
        label: 'Filter Twitch-Disallowed Emotes',
        control: 'checkbox',
        default: true,
        advanced: true
    },
    {
        key: 'thirdPartyFilter7tvSexual',
        group: 'third_party_emotes',
        label: 'Filter Sexual Content',
        control: 'checkbox',
        default: false,
        advanced: true
    },
    {
        key: 'thirdPartyFilter7tvEpilepsy',
        group: 'third_party_emotes',
        label: 'Filter Epilepsy Triggers',
        control: 'checkbox',
        default: true,
        advanced: true
    },
    {
        key: 'thirdPartyFilter7tvEdgy',
        group: 'third_party_emotes',
        label: 'Filter Edgy Content',
        control: 'checkbox',
        default: false,
        advanced: true
    },

    // --- Badges & Cheermotes ---
    // NOTE: every item below is `internal: true` — cache TTLs, hardcoded Cloud Function
    // endpoints, and other plumbing that isn't an end-user-facing setting (the original
    // chat.html config panel never exposed these either; badgeFallbackHide in particular
    // is hardcoded to `true` on save in settings-panel-manager.js, never a user choice).
    // They stay in CONFIG_SCHEMA (required for parity with ConfigManager.getDefaultConfig()
    // and the proxy's ALLOWED_CONFIG_KEYS — see config-schema.test.js) but
    // getVisibleSchemaItems() filters them out of the rendered form.
    {
        key: 'badgeFallbackHide',
        group: 'badges_cheermotes',
        label: 'Hide Missing Badges',
        control: 'checkbox',
        default: true,
        advanced: true,
        internal: true
    },
    {
        key: 'badgeCacheGlobalTTL',
        group: 'badges_cheermotes',
        label: 'Global Badge Cache TTL (ms)',
        control: 'number',
        default: 43200000,
        advanced: true,
        internal: true
    },
    {
        key: 'badgeCacheChannelTTL',
        group: 'badges_cheermotes',
        label: 'Channel Badge Cache TTL (ms)',
        control: 'number',
        default: 3600000,
        advanced: true,
        internal: true
    },
    {
        key: 'cheermoteCacheTTL',
        group: 'badges_cheermotes',
        label: 'Cheermote Cache TTL (ms)',
        control: 'number',
        default: 43200000,
        advanced: true,
        internal: true
    },
    {
        key: 'thirdPartyEmoteCacheGlobalTTL',
        group: 'badges_cheermotes',
        label: '3rd-Party Emote Global Cache TTL (ms)',
        control: 'number',
        default: 43200000,
        advanced: true,
        internal: true
    },
    {
        key: 'thirdPartyEmoteCacheChannelTTL',
        group: 'badges_cheermotes',
        label: '3rd-Party Emote Channel Cache TTL (ms)',
        control: 'number',
        default: 3600000,
        advanced: true,
        internal: true
    },

    // --- Cache & Endpoints ---
    // Also all internal: true — see note above.
    {
        key: 'badgeEndpointUrlGlobal',
        group: 'cache_endpoints',
        label: 'Global Badges Endpoint',
        control: 'text',
        default: 'https://us-central1-chat-themer.cloudfunctions.net/getGlobalBadges',
        advanced: true,
        internal: true
    },
    {
        key: 'badgeEndpointUrlChannel',
        group: 'cache_endpoints',
        label: 'Channel Badges Endpoint',
        control: 'text',
        default: 'https://us-central1-chat-themer.cloudfunctions.net/getChannelBadges',
        advanced: true,
        internal: true
    },
    {
        key: 'cheermoteEndpointUrl',
        group: 'cache_endpoints',
        label: 'Cheermotes Endpoint',
        control: 'text',
        default: 'https://us-central1-chat-themer.cloudfunctions.net/getCheermotes',
        advanced: true,
        internal: true
    },
    {
        key: 'lastChannel',
        group: 'cache_endpoints',
        label: 'Last Joined Channel',
        control: 'text',
        default: '',
        advanced: true,
        internal: true
    },
    {
        key: 'configVersion',
        group: 'cache_endpoints',
        label: 'Config Schema Version',
        control: 'number',
        default: 2,
        advanced: true,
        internal: true
    }
];
