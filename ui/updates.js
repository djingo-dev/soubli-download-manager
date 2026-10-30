let updatesSignature = '';
let _updatesPollTimer = null;
function _stopUpdatesPoll() { if (_updatesPollTimer) { clearInterval(_updatesPollTimer); _updatesPollTimer = null; } }
function _startUpdatesPoll() {
    if (_updatesPollTimer) return;
    _updatesPollTimer = setInterval(async () => {
        try { await refresh(); const dl = state?.updates?.download; if (!dl || dl.status !== 'downloading') _stopUpdatesPoll(); } catch { }
    }, 800);
}
function renderUpdates() {
    const u = state?.updates; if (!u) return;
    const signature = state.settings.language + JSON.stringify(u); if (signature === updatesSignature && $('#dialog').open) return; updatesSignature = signature;
    const available = u.status === 'available', busy = u.status === 'checking', release = u.release;
    const dl = u.download, downloading = dl?.status === 'downloading', dlReady = dl?.status === 'ready', dlError = dl?.status === 'error' || dl?.status === 'cancelled';
    if (downloading) _startUpdatesPoll(); else _stopUpdatesPoll();
    const errors = { offline: t('تعذر الاتصال بـ GitHub. تحقق من اتصال الإنترنت وأعد المحاولة.', 'Could not reach GitHub. Check your connection and try again.'), 'rate-limit': t('GitHub يطلب الانتظار قبل إعادة الفحص. حاول لاحقًا.', 'GitHub has limited update requests. Please try again later.'), 'no-release': t('لا يوجد إصدار منشور متاح حاليًا.', 'No published release is available yet.'), 'invalid-release': t('تعذر التحقق من بيانات الإصدار. لم يتم فتح أي رابط.', 'The release could not be verified. No link was opened.'), 'not-ready': t('الإصدار المنشور لا يحتوي على نسخة جاهزة لنظامك بعد.', 'The published release does not have a ready download for your system yet.') };
    const dlErrors = { 'download-failed': t('فشل التحميل. تحقق من اتصالك وأعد المحاولة.', 'Download failed. Check your connection and try again.'), 'download-too-large': t('حجم الملف غير متوقع. حاول التثبيت من GitHub.', 'Unexpected file size. Try installing from GitHub.'), 'not-ready': t('ملف التحميل غير جاهز بعد.', 'Download file is not ready yet.'), cancelled: t('تم إلغاء التحميل.', 'Download was cancelled.'), 'no-update': t('لا يوجد تحديث متاح.', 'No update available.') };
    const title = available ? t('تحديث جديد متاح', 'A new update is available') : busy ? t('جارٍ البحث عن تحديثات…', 'Checking for updates…') : u.status === 'current' ? t('أنت تستخدم أحدث إصدار', 'You are up to date') : u.status === 'error' ? t('تعذر إكمال الفحص', 'Could not check for updates') : t('تحديثات Soubli', 'Soubli updates');
    const mbR = dl ? (dl.received / 1048576).toFixed(1) : '0', mbT = dl?.total ? (dl.total / 1048576).toFixed(1) : '?';
    const progressSection = available && dl ? `<div class="update-download-status" style="margin:10px 0">${downloading ? `<div style="background:#e0e4e8;border-radius:4px;height:6px;margin-bottom:6px" role="progressbar" aria-valuenow="${dl.percent}" aria-valuemin="0" aria-valuemax="100"><div style="background:#2563eb;width:${dl.percent}%;height:100%;border-radius:4px;transition:width .4s ease"></div></div><p class="help">${h(t('جارٍ التحميل', 'Downloading'))} — ${dl.percent}%${dl.total ? ` (${mbR} / ${mbT} MB)` : ''}</p>` : dlReady ? `<p class="help" style="color:#16a34a">✓ ${h(t('اكتمل التحميل — جاهز للتثبيت.', 'Download complete — ready to install.'))}</p>` : `<p class="help" style="color:#dc2626">⚠ ${h(dlErrors[dl.error] || dlErrors['download-failed'])}</p>`}</div>` : '';
    const body = `<div class="modal-body update-body"><div class="update-hero ${available ? 'available' : ''}"><div class="update-mark">${icon(busy ? 'refresh' : available ? 'arrow' : u.status === 'current' ? 'check' : 'info')}</div><div><h2>${h(title)}</h2><p>${t('الإصدار المثبت', 'Installed version')}: <bdi>${h(u.currentVersion)}</bdi>${available ? ' · ' + t('الجديد', 'New') + ': <bdi>' + h(release.version) + '</bdi>' : ''}</p></div></div>${u.status === 'error' ? `<div class="info-box update-error" role="status">${h(errors[u.error] || errors.offline)}</div>` : ''}${available ? `<section class="update-notes"><h3>${h(release.title)}</h3><div class="update-release-notes" dir="auto">${h(release.notes || t('تفاصيل الإصدار متاحة على GitHub.', 'Release details are available on GitHub.'))}</div><p class="help">${t('أغلق soubli من قائمته قبل تطبيق التحديث.', 'Exit soubli from its menu before applying the update.')}</p></section>${progressSection}` : `<p class="help">${busy ? t('نفحص الإصدارات المنشورة في الريبو الرسمي.', 'Checking published releases in the official repository.') : t('التنبيه يعتمد على إصدار منشور برقم أحدث، وليس مجرد تعديل ملفات السورس.', 'Notifications follow published releases with newer version numbers, rather than source-only commits.')}</p>`}<div class="update-preference">${check('automaticUpdates', t('التحقق تلقائيًا عند التشغيل ثم كل 6 ساعات', 'Check automatically at startup and every 6 hours'), u.enabled)}</div><div class="update-source" dir="ltr">github.com/Djingo-dev/soubli-download-manager</div>${u.lastChecked ? `<p class="help">${t('آخر فحص', 'Last checked')}: ${h(new Date(u.lastChecked).toLocaleString(state.settings.language === 'ar' ? 'ar-EG' : 'en-GB'))}</p>` : ''}</div>`;
    const footer = downloading ? `${button('updatesCancelDownload', t('إلغاء التحميل', 'Cancel Download'), null)}` : dlReady ? `${button('updatesSkip', t('تخطي هذا الإصدار', 'Skip this version'), null)}${button('updatesLater', t('ذكرني غدًا', 'Remind me tomorrow'), null)}${button('updatesApply', t('تطبيق وإعادة التشغيل', 'Apply & Restart'), 'refresh', 'primary')}` : available ? `${button('updatesSkip', t('تخطي هذا الإصدار', 'Skip this version'), null)}${button('updatesLater', t('ذكرني غدًا', 'Remind me tomorrow'), null)}${button('updatesOpen', t('GitHub', 'GitHub'), 'external')}${button('updatesInstall', t('تثبيت مباشر', 'Install'), 'download', 'primary')}` : `${button('close', t('إغلاق', 'Close'), null)}${button('updatesCheck', busy ? t('جارٍ الفحص…', 'Checking…') : t('إعادة الفحص', 'Check again'), 'refresh', 'primary', busy ? 'disabled' : '')}`;
    modal(t('تحديثات Soubli', 'Soubli updates'), body, footer); $('#dialog').classList.add('update-dialog');
}
const beforeUpdateAction = handleAction;
handleAction = async (name, el) => {
    if (name === 'checkUpdates') {
        closeDesktopMenus();
        if (!window.desktopAPI) return toast(t('التحقق من التحديثات متاح في نسخة سطح المكتب.', 'Update checks are available in the desktop edition.'), true);
        await api('window', { kind: 'updates' }); await api('updatesCheck'); return;
    }
    if (name === 'updatesCheck') { el.disabled = true; await api('updatesCheck'); await refresh(); return; }
    if (name === 'updatesOpen') { await api('updatesOpen'); closeModal(); return; }
    if (name === 'updatesInstall') {
        if (!window.desktopAPI) return toast(t('التثبيت المباشر متاح في نسخة سطح المكتب فقط.', 'Direct install is only available in the desktop edition.'), true);
        el.disabled = true;
        const portable = !!(state?.runtime?.portable);
        await api('updatesDownload', { portable }); await refresh(); return;
    }
    if (name === 'updatesCancelDownload') { await api('updatesCancelDownload'); await refresh(); return; }
    if (name === 'updatesApply') {
        el.disabled = true;
        try { await api('updatesApply'); } catch (error) { toast(error.message, true); el.disabled = false; await refresh(); }
        return;
    }
    if (name === 'updatesLater' || name === 'updatesSkip') { await api(name); closeModal(); return; }
    return beforeUpdateAction(name, el);
};
document.addEventListener('change', async e => {
    if (e.target.name !== 'automaticUpdates') return;
    try { await api('updatesPreferences', { enabled: e.target.checked }); await refresh(); } catch (error) { toast(error.message, true); }
});
