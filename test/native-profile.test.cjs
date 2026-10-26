const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { acquireProfile, backupBeforeNative } = require('../src/native-profile.cjs');
test('desktop library rejects a second live owner and releases only its own lease', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soubli-owner-')), release = acquireProfile(dir);
    assert.throws(() => acquireProfile(dir), /Another soubli/); release(); release(); const second = acquireProfile(dir); second(); assert.equal(fs.existsSync(path.join(dir, 'desktop-owner.json')), false);
});
test('migration backup preserves exact encrypted library and key metadata without copying downloads', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soubli-migration-')); fs.mkdirSync(path.join(dir, 'soubliData/Partial'), { recursive: true });
    for (const name of ['Local State', 'soubliData/realm-key.protected', 'soubliData/soubli.realm', 'soubliData/Partial/large.part']) fs.writeFileSync(path.join(dir, name), 'controlled ' + name);
    const backup = backupBeforeNative(dir); for (const name of ['Local State', 'soubliData/realm-key.protected', 'soubliData/soubli.realm']) assert.deepEqual(fs.readFileSync(path.join(backup, name)), fs.readFileSync(path.join(dir, name)));
    assert.equal(fs.existsSync(path.join(backup, 'soubliData/Partial')), false); assert.equal(backupBeforeNative(dir), backup);
    assert.equal(JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'))).files.length, 3);
});
