let dropLanguage = 'en';

function formatSize(n) {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'], i = Math.min(3, Math.floor(Math.log(Math.max(1, n)) / Math.log(1024)));
    return (n / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + units[i];
}

async function syncDrop() {
    try {
        const state = await window.desktopAPI.state();
        dropLanguage = state.settings.language || 'en';
        applyAppearance(state.settings.theme);
        if (window.soubliWorkspaceAppearance) {
            window.soubliWorkspaceAppearance.apply(state.downloadTools?.preferences);
        }
        document.documentElement.lang = dropLanguage;
        document.documentElement.dir = dropLanguage === 'ar' ? 'rtl' : 'ltr';

        const strongEl = document.querySelector('#drop-target strong');
        if (strongEl) {
            strongEl.textContent = dropLanguage === 'ar' ? 'أفلت الرابط هنا' : 'Drop a link here';
        }

        const closeEl = document.querySelector('#close');
        if (closeEl) {
            closeEl.setAttribute('aria-label', dropLanguage === 'ar' ? 'إغلاق' : 'Close');
            closeEl.setAttribute('title', dropLanguage === 'ar' ? 'إغلاق' : 'Close');
        }

        // Live stats update
        const activeDownloads = (state.downloads || []).filter(d => ['downloading', 'probing', 'processing'].includes(d.status));
        const totalSpeed = activeDownloads.reduce((sum, d) => sum + (d.speed || 0), 0);

        const countEl = document.querySelector('#drop-active-count');
        const speedEl = document.querySelector('#drop-speed');
        if (countEl) {
            countEl.textContent = dropLanguage === 'ar' ? `${activeDownloads.length} نشط` : `${activeDownloads.length} active`;
        }
        if (speedEl) {
            speedEl.textContent = `↓ ${formatSize(totalSpeed)}/s`;
        }
    } catch {}
}

syncDrop();
setInterval(syncDrop, 1000);

document.querySelector('#close').onclick = () => window.desktopAPI?.action('dropClose');

document.addEventListener('dragover', e => {
    e.preventDefault();
    document.body.classList.add('over');
});

document.addEventListener('dragleave', e => {
    if (e.relatedTarget === null) {
        document.body.classList.remove('over');
    }
});

document.addEventListener('drop', async e => {
    e.preventDefault();
    document.body.classList.remove('over');
    const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n')[0].trim();
    if (!url) return;
    
    const statusEl = document.querySelector('#drop-status');
    try {
        await window.desktopAPI.action('add', { url });
        if (statusEl) {
            statusEl.textContent = dropLanguage === 'ar' ? '✓ تمت إضافة التحميل بنجاح' : '✓ Download added successfully';
            statusEl.style.color = 'var(--primary)';
            setTimeout(() => {
                statusEl.textContent = dropLanguage === 'ar' ? 'أفلت أي رابط أو Magnet للتحميل' : 'Drop any URL or Magnet to download';
                statusEl.style.color = '';
            }, 3000);
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = err.message || (dropLanguage === 'ar' ? 'تعذر إضافة الرابط' : 'Failed to add download');
            statusEl.style.color = '#ef4444';
        }
    }
});
