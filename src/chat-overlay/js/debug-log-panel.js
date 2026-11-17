// Opt-in on-page log panel for browsers without reachable devtools (TikTok LIVE Studio).
// Enabled only with ?logpanel=1 in the overlay URL.
(function () {
    if (new URLSearchParams(location.search).get('logpanel') !== '1') return;

    const lines = [];
    let panel = null;
    const t0 = performance.now();

    function fmt(arg) {
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg); } catch (_) { return String(arg); }
    }

    function render() {
        if (!panel) return;
        panel.textContent = lines.join('\n');
        panel.scrollTop = panel.scrollHeight;
    }

    function push(level, args) {
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        const text = Array.prototype.map.call(args, fmt).join(' ');
        lines.push(`${secs}s ${level} ${text}`.slice(0, 600));
        if (lines.length > 200) lines.shift();
        render();
    }

    ['log', 'info', 'warn', 'error'].forEach((level) => {
        const orig = console[level].bind(console);
        console[level] = function () {
            push(level.toUpperCase(), arguments);
            orig.apply(null, arguments);
        };
    });

    window.addEventListener('error', (e) => push('UNCAUGHT', [e.message, `${e.filename}:${e.lineno}`]));
    window.addEventListener('unhandledrejection', (e) => push('REJECTION', [e.reason]));

    let storageState = 'ok';
    try { localStorage.setItem('__lp', '1'); localStorage.removeItem('__lp'); } catch (e) { storageState = `throws ${e.name}`; }
    push('INFO', [`UA=${navigator.userAgent}`]);
    push('INFO', [`localStorage ${storageState}; visibility=${document.visibilityState}; online=${navigator.onLine}`]);
    document.addEventListener('visibilitychange', () => push('INFO', [`visibility=${document.visibilityState}`]));

    function mount() {
        panel = document.createElement('pre');
        panel.id = 'debug-log-panel';
        panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:60%;overflow:auto;margin:0;' +
            'padding:4px;background:rgba(0,0,0,.85);color:#0f0;font:10px/1.25 monospace;white-space:pre-wrap;' +
            'word-break:break-all;z-index:2147483647;pointer-events:none';
        document.body.appendChild(panel);
        render();
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
