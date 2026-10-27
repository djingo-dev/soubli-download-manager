'use strict';

const {
    test,
    after
} = require('node:test');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const {
    Service
} = require('../src/service.cjs');

const {
    EngineHostClient
} = require('../src/engine-host-client.cjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, {
    timeout = 15000,
    interval = 25,
    message = 'Condition was not met before timeout'
} = {}) {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
        if (await fn()) {
            return;
        }

        await wait(interval);
    }

    throw new Error(message);
}

test(
    'independent engine respects live limits, cancellation stays removed, and orderly detach keeps a queued batch running',
    async t => {
        const root = fs.mkdtempSync(
            path.join(os.tmpdir(), 'soubli-host-controls-')
        );

        const body = Buffer.alloc(6 * 1024 * 1024, 29);

        let s;
        let client;
        let serverClosed = false;

        const server = http.createServer((req, res) => {
            const match = /bytes=(\d+)-(\d*)/.exec(
                req.headers.range || ''
            );

            const start = match ? Number(match[1]) : 0;
            const end = match && match[2]
                ? Number(match[2])
                : body.length - 1;

            if (
                start < 0 ||
                start >= body.length ||
                end < start ||
                end >= body.length
            ) {
                res.writeHead(416, {
                    'content-range': `bytes */${body.length}`
                });
                res.end();
                return;
            }

            res.writeHead(match ? 206 : 200, {
                'content-length': end - start + 1,
                etag: '"host-controls"',
                ...(match
                    ? {
                        'content-range':
                            `bytes ${start}-${end}/${body.length}`
                    }
                    : {})
            });

            if (req.method === 'HEAD') {
                res.end();
                return;
            }

            let position = start;

            const timer = setInterval(() => {
                if (res.destroyed || res.writableEnded) {
                    clearInterval(timer);
                    return;
                }

                if (position > end) {
                    clearInterval(timer);
                    res.end();
                    return;
                }

                const next = Math.min(end + 1, position + 32768);

                res.write(body.subarray(position, next));
                position = next;
            }, 20);

            res.on('close', () => clearInterval(timer));
        });

        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });

        const attach = () => {
            s = new Service(root);
            client = new EngineHostClient(s);

            s.engineHost = client;
            s.engine.workerClient = client;

            return s;
        };

        try {
            attach();

            s.store.saveSettings({
                simultaneous: 2,
                connections: 2,
                sounds: false,
                completionDialog: false
            });

            const origin =
                `http://127.0.0.1:${server.address().port}`;

            const ids = [];

            for (let i = 0; i < 3; i++) {
                const result = await s.action('add', {
                    url: `${origin}/${i}.bin`,
                    name: `${i}.bin`
                });

                assert.ok(
                    result && result.id,
                    `Adding download ${i} should return an ID`
                );

                ids.push(result.id);
            }

            await until(
                () => {
                    const first = s.store.find(ids[0]);
                    const second = s.store.find(ids[1]);

                    return Boolean(
                        first &&
                        second &&
                        first.downloaded > 0 &&
                        second.downloaded > 0
                    );
                },
                {
                    timeout: 20000,
                    message:
                        'The first two downloads did not start in time'
                }
            );

            await t.test('live download limits', async () => {
                await s.action('settings', {
                    simultaneous: 1,
                    connections: 1
                });

                assert.equal(
                    s.engine.active.size,
                    1,
                    `Expected 1 active download after updating limits; got ${s.engine.active.size}`
                );
            });

            await t.test('cancelled download stays removed', async () => {
                await s.action('cancel', {
                    id: ids[1]
                });

                await until(
                    () => s.store.find(ids[1]) === undefined,
                    {
                        timeout: 5000,
                        message:
                            'Cancelled download remained in the store'
                    }
                );

                const snapshot = await client.rpc('snapshot');

                assert.equal(
                    snapshot.downloads.some(
                        download => download.id === ids[1]
                    ),
                    false,
                    `Cancelled download ${ids[1]} remained in the engine snapshot`
                );
            });

            await t.test('detach preserves queued downloads', async () => {
                await client.detach();
                await s.close();
                s = null;

                const targets = [0, 2].map(index =>
                    path.join(
                        root,
                        'Downloads',
                        `${index}.bin`
                    )
                );

                await until(
                    () => targets.every(target =>
                        fs.existsSync(target) &&
                        fs.statSync(target).size === body.length
                    ),
                    {
                        timeout: 30000,
                        message:
                            'Downloads did not finish after engine detach'
                    }
                );

                for (const target of targets) {
                    assert.deepEqual(
                        fs.readFileSync(target),
                        body,
                        `Downloaded file content did not match: ${target}`
                    );
                }

                attach();
                await client.attach();

                for (const id of [ids[0], ids[2]]) {
                    const download = s.store.find(id);

                    assert.ok(
                        download,
                        `Completed download ${id} should remain in the store`
                    );

                    assert.equal(
                        download.status,
                        'complete',
                        `Download ${id} should be marked complete`
                    );
                }

                assert.equal(
                    s.store.find(ids[1]),
                    undefined,
                    'Cancelled download should not reappear after reattach'
                );
            });
        
        } finally {
            try {
                await s?.close();
            } finally {
                server.closeAllConnections();

                if (server.listening) {
                    await new Promise(resolve => {
                        server.close(() => resolve());
                    });
                }

                // Give Realm and Windows a short chance to release file handles.
                await wait(500);

                try {
                    fs.rmSync(root, {
                        recursive: true,
                        force: true,
                        maxRetries: 8,
                        retryDelay: 250
                    });
                } catch (error) {
                    if (error.code !== 'EBUSY' && error.code !== 'EPERM') {
                        throw error;
                    }

                    // Realm may still be releasing its database file.
                    await wait(1500);

                    fs.rmSync(root, {
                        recursive: true,
                        force: true,
                        maxRetries: 8,
                        retryDelay: 500
                    });
                }
            }
        }
    }
);

after(async () => {
    const Realm = require('realm');
    await Realm.shutdown();
});
