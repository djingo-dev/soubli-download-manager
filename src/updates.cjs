const REPOSITORY = 'djingo-dev/soubli-download-manager';
const REPOSITORY_URL = 'https://github.com/' + REPOSITORY;
const RELEASE_API = 'https://api.github.com/repos/' + REPOSITORY + '/releases/latest';
const DAY = 24 * 60 * 60 * 1000;
function versionParts(value) {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(value));
    if (!match) return null; const parts = match.slice(1).map(Number); return parts.every(Number.isSafeInteger) ? parts : null;
}
function newerVersion(candidate, current) { const a = versionParts(candidate), b = versionParts(current); if (!a || !b) return false; for (let n = 0; n < 3; n++) { if (a[n] !== b[n]) return a[n] > b[n]; } return false; }
function updateError(code) { const error = new Error(code); error.updateCode = code; return error; }
function releaseInfo(data, platform = process.platform) {
    if (!data || data.draft !== false || data.prerelease !== false || !versionParts(data.tag_name) || !Array.isArray(data.assets)) throw updateError('invalid-release');
    const tag = data.tag_name, version = versionParts(tag).join('.'), url = REPOSITORY_URL + '/releases/tag/' + encodeURIComponent(tag);
    if (data.html_url !== url) throw updateError('invalid-release');
    const prefix = REPOSITORY_URL + '/releases/download/' + encodeURIComponent(tag) + '/';
    const ready = name => (data.assets || []).some(a => a.name === name && a.state === 'uploaded' && Number.isFinite(a.size) && a.size > 0 && a.browser_download_url === prefix + name);
    const setup = ready(`soubli-${version}-Setup.exe`), portable = ready(`soubli-${version}-Portable.exe`);
    const linux = ready(`soubli-${version}-linux-x64.AppImage`) || ready(`soubli-${version}-linux-amd64.deb`) || ready(`soubli-${version}-linux-x86_64.rpm`);
    if (platform === 'linux' ? !linux : !setup && !portable) throw updateError('not-ready');
    return { version, tag, url, title: String(data.name || 'soubli ' + version).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 180), notes: String(data.body || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, 12000), linux, publishedAt: typeof data.published_at === 'string' ? data.published_at : '', setup, portable, setupUrl: setup ? prefix + `soubli-${version}-Setup.exe` : '', portableUrl: portable ? prefix + `soubli-${version}-Portable.exe` : '', appImageUrl: ready(`soubli-${version}-linux-x64.AppImage`) ? prefix + `soubli-${version}-linux-x64.AppImage` : '' };
}
class UpdateChecker {
    constructor({ version, store, fetch: fetchRelease = globalThis.fetch, openExternal, onAvailable, platform = process.platform, now = Date.now, timeout = 10000 }) {
        Object.assign(this, { version, store, fetch: fetchRelease, openExternal, onAvailable, platform, now, timeout });
        const saved = store.get('updatePreferences', {});
        this.preferences = { enabled: saved.enabled !== false, skippedVersion: versionParts(saved.skippedVersion) ? saved.skippedVersion : '', remindAfter: Number.isFinite(saved.remindAfter) ? saved.remindAfter : 0, lastPromptedVersion: String(saved.lastPromptedVersion || ''), lastPromptedAt: Number.isFinite(saved.lastPromptedAt) ? saved.lastPromptedAt : 0 };
        this.status = 'idle'; this.release = null; this.lastChecked = null; this.error = ''; this.disposed = false; this.etag = ''; this.cachedRelease = null; this.downloadState = null; this.downloadController = null;
    }
    snapshot() { return { currentVersion: this.version, status: this.status, release: this.release ? { ...this.release } : null, lastChecked: this.lastChecked, error: this.error, download: this.downloadState ? { ...this.downloadState } : null, ...this.preferences, repository: REPOSITORY_URL }; }
    save() { if (!this.disposed) this.store.set('updatePreferences', this.preferences); }
    setEnabled(enabled) { if (typeof enabled !== 'boolean') throw Error('Choose whether automatic update checks are enabled.'); this.preferences.enabled = enabled; this.save(); return this.snapshot(); }
    snooze() { this.preferences.remindAfter = this.now() + DAY; this.save(); return this.snapshot(); }
    skip() { if (this.release && newerVersion(this.release.version, this.version)) { this.preferences.skippedVersion = this.release.version; this.save(); } return this.snapshot(); }
    shouldPrompt() { const p = this.preferences; return this.status === 'available' && this.release && p.enabled && p.skippedVersion !== this.release.version && this.now() >= p.remindAfter && (p.lastPromptedVersion !== this.release.version || this.now() - p.lastPromptedAt >= DAY); }
    check({ manual = false } = {}) {
        if (this.disposed || !manual && !this.preferences.enabled) return Promise.resolve(this.snapshot());
        if (this.pending) return this.pending;
        this.pending = this.runCheck(manual).finally(() => { this.pending = null; }); return this.pending;
    }
    async runCheck(manual) {
        this.status = 'checking'; this.error = ''; this.controller = new AbortController();
        const timer = setTimeout(() => this.controller?.abort(), this.timeout); timer.unref?.();
        try {
            const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'soubli/' + this.version, 'X-GitHub-Api-Version': '2026-03-10' };
            if (this.etag && this.cachedRelease) headers['If-None-Match'] = this.etag;
            const response = await this.fetch(RELEASE_API, { headers, signal: this.controller.signal, redirect: 'error' });
            let release;
            if (response.status === 304 && this.cachedRelease) release = this.cachedRelease;
            else {
                if (response.status === 403 || response.status === 429) throw updateError('rate-limit');
                if (response.status === 404) throw updateError('no-release');
                if (!response.ok) throw updateError('offline');
                if (Number(response.headers.get('content-length')) > 512 * 1024) throw updateError('invalid-release');
                const chunks = []; let size = 0;
                for await (const chunk of response.body) { size += chunk.length; if (size > 512 * 1024) { this.controller.abort(); throw updateError('invalid-release'); } chunks.push(Buffer.from(chunk)); }
                let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw updateError('invalid-release'); }
                release = releaseInfo(data, this.platform); this.cachedRelease = release; this.etag = response.headers.get('etag') || '';
            }
            if (this.disposed) return this.snapshot();
            this.release = release; this.lastChecked = new Date(this.now()).toISOString(); this.status = newerVersion(release.version, this.version) ? 'available' : 'current';
            if (!manual && this.shouldPrompt() && this.onAvailable) {
                await this.onAvailable();
                if (!this.disposed) { this.preferences.lastPromptedVersion = release.version; this.preferences.lastPromptedAt = this.now(); this.save(); }
            }
        } catch (error) { if (!this.disposed) { this.status = 'error'; this.error = error.updateCode || 'offline'; } }
        finally { clearTimeout(timer); this.controller = null; }
        return this.snapshot();
    }
    async openRelease() {
        if (this.status !== 'available' || !this.release || !newerVersion(this.release.version, this.version)) throw Error('Check for a newer release first.');
        // Renderer input and release-body links never choose the external destination.
        const expected = REPOSITORY_URL + '/releases/tag/' + encodeURIComponent(this.release.tag);
        if (this.release.url !== expected || !versionParts(this.release.tag)) throw Error('Invalid update destination.');
        if (!this.openExternal) throw Error('Open updates from the desktop app.');
        await this.openExternal(expected); return true;
    }
    async download({ portable = false } = {}) {
        if (this.downloadState?.status === 'downloading') throw updateError('already-downloading');
        if (this.status !== 'available' || !this.release || !newerVersion(this.release.version, this.version)) throw updateError('no-update');
        const isPortable = !!portable;
        const url = isPortable ? this.release.portableUrl : (this.release.setupUrl || this.release.portableUrl);
        if (!url) throw updateError('not-ready');
        const name = (isPortable || !this.release.setupUrl) ? `soubli-${this.release.version}-Portable.exe` : `soubli-${this.release.version}-Setup.exe`;
        this.downloadState = { status: 'downloading', percent: 0, received: 0, total: 0, portable: isPortable, path: null, error: '' };
        this.downloadController = new AbortController();
        const timer = setTimeout(() => this.downloadController?.abort(), 10 * 60 * 1000); timer.unref?.();
        const sysOs = require('node:os'), sysPath = require('node:path'), sysFs = require('node:fs');
        let tmpDir = null, outPath = null;
        try {
            tmpDir = sysFs.mkdtempSync(sysPath.join(sysOs.tmpdir(), 'soubli-update-'));
            outPath = sysPath.join(tmpDir, name);
            const response = await this.fetch(url, { signal: this.downloadController.signal, redirect: 'follow', headers: { 'User-Agent': 'soubli/' + this.version } });
            if (!response.ok) throw updateError('download-failed');
            const total = Number(response.headers.get('content-length')) || 0;
            if (total > 200 * 1024 * 1024) throw updateError('download-too-large');
            let received = 0; const chunks = [];
            for await (const chunk of response.body) {
                chunks.push(Buffer.from(chunk)); received += chunk.length;
                if (received > 200 * 1024 * 1024) { this.downloadController.abort(); throw updateError('download-too-large'); }
                if (!this.disposed) this.downloadState = { ...this.downloadState, received, total, percent: total ? Math.round(received / total * 100) : 0 };
            }
            if (this.disposed) return this.snapshot();
            sysFs.writeFileSync(outPath, Buffer.concat(chunks));
            this.downloadState = { ...this.downloadState, status: 'ready', path: outPath, percent: 100, total: received };
        } catch (error) {
            try { if (outPath) sysFs.unlinkSync(outPath); } catch { }
            try { if (tmpDir) sysFs.rmdirSync(tmpDir); } catch { }
            this.downloadState = { ...this.downloadState, status: 'error', error: error.updateCode || 'download-failed' };
        } finally { clearTimeout(timer); this.downloadController = null; }
        return this.snapshot();
    }
    cancelDownload() { this.downloadController?.abort(); if (this.downloadState?.status === 'downloading') this.downloadState = { ...this.downloadState, status: 'cancelled', error: 'cancelled' }; return this.snapshot(); }
    start() { if (this.disposed || this.interval) return; this.startTimer = setTimeout(() => this.check().catch(() => { }), 10000); this.startTimer.unref(); this.interval = setInterval(() => this.check().catch(() => { }), 6 * 60 * 60 * 1000); this.interval.unref(); }
    stop() { this.disposed = true; clearTimeout(this.startTimer); clearInterval(this.interval); this.controller?.abort(); this.downloadController?.abort(); }
}
module.exports = { UpdateChecker, newerVersion, versionParts, releaseInfo, RELEASE_API, REPOSITORY_URL };
