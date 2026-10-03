import assert from 'node:assert/strict';
import { sameOrigin } from '../lib/request-origin.ts';

const origin = 'https://app.example.com';
function form(site, mode = 'navigate', destination = 'document', suppliedOrigin = 'null') {
    return new Request(origin + '/auth/signout', { method: 'POST', headers: {
        host: 'app.example.com', origin: suppliedOrigin,
        'sec-fetch-site': site, 'sec-fetch-mode': mode, 'sec-fetch-dest': destination,
    } });
}

// Native forms keep working with the application's no-referrer policy.
assert.equal(sameOrigin(form('same-origin')), true);
// A foreign site can force Origin:null but cannot claim same-origin metadata.
for (const site of ['cross-site', 'same-site', 'none', '']) {
    assert.equal(sameOrigin(form(site)), false);
}
assert.equal(sameOrigin(form('same-origin', 'cors', 'empty')), false);
assert.equal(sameOrigin(form('same-origin', 'navigate', 'iframe')), false);
assert.equal(sameOrigin(form('same-origin', 'navigate', 'document', 'https://foreign.example')), false);
assert.equal(sameOrigin(form('same-origin', 'cors', 'empty', origin)), true);
assert.equal(sameOrigin(new Request(origin + '/auth/signout', { method: 'POST', headers: { host: 'app.example.com', origin: 'null' } })), false);
console.log('Native form and cross-site origin regression checks passed');
