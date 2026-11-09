const test = require('node:test');
const assert = require('node:assert');
const { decideMainVersion, nextStagingVersion } = require('./release-version.cjs');

test('inherits staging number that came in with the merge', () => {
  assert.strictEqual(decideMainVersion({ prev: '1.3.1', head: '1.3.2', flag: '' }), '1.3.2');
  assert.strictEqual(decideMainVersion({ prev: '1.3.9', head: '1.4.0', flag: '' }), '1.4.0');
});
test('hotfix straight on main patch-bumps prev', () => {
  assert.strictEqual(decideMainVersion({ prev: '1.3.1', head: '1.3.1', flag: '' }), '1.3.2');
  assert.strictEqual(decideMainVersion({ prev: '1.3.1', head: '1.2.0', flag: '' }), '1.3.2');
});
test('minor and major flags bump prev', () => {
  assert.strictEqual(decideMainVersion({ prev: '1.3.1', head: '1.3.2', flag: 'minor' }), '1.4.0');
  assert.strictEqual(decideMainVersion({ prev: '1.3.1', head: '1.3.2', flag: 'major' }), '2.0.0');
});
test('semver compare is numeric, not lexical', () => {
  assert.strictEqual(decideMainVersion({ prev: '1.3.9', head: '1.3.10', flag: '' }), '1.3.10');
});
test('staging is main + 1 patch', () => {
  assert.strictEqual(nextStagingVersion({ main: '1.3.2', staging: '1.3.2' }), '1.3.3');
  assert.strictEqual(nextStagingVersion({ main: '1.4.0', staging: '1.3.2' }), '1.4.1');
});
test('staging never goes lower than its current version', () => {
  assert.strictEqual(nextStagingVersion({ main: '1.3.2', staging: '1.5.0' }), '1.5.0');
});
