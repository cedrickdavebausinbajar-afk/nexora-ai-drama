import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReleaseVersion,
  compareReleaseVersions,
  findOfficialApkAsset,
  fetchLatestRelease
} from '../update-manager.js';

const repo = 'nexoraofficialph/nexora-ai-drama';
function release(tag = 'v1.0.301', overrides = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{
      name: 'NEXORA-AI-DRAMA.apk',
      state: 'uploaded',
      size: 7524281,
      browser_download_url: 'https://github.com/' + repo + '/releases/download/' + tag + '/NEXORA-AI-DRAMA.apk',
      digest: 'sha256:' + 'a'.repeat(64)
    }],
    ...overrides
  };
}

test('release tags are parsed strictly and compared semantically', () => {
  assert.deepEqual(parseReleaseVersion('v1.0.301'), {major:1,minor:0,patch:301,code:301,name:'1.0.301'});
  assert.equal(parseReleaseVersion('1.0.301'), null);
  assert.equal(parseReleaseVersion('v1.0.latest'), null);
  assert.equal(compareReleaseVersions(parseReleaseVersion('v1.1.0'), parseReleaseVersion('v1.0.999')), 1);
  assert.equal(compareReleaseVersions(parseReleaseVersion('v1.0.301'), parseReleaseVersion('v1.0.302')), -1);
});

test('only the exact official uploaded APK asset is accepted', () => {
  const found = findOfficialApkAsset(release());
  assert.equal(found.url, 'https://github.com/' + repo + '/releases/download/v1.0.301/NEXORA-AI-DRAMA.apk');
  assert.equal(found.sha256, 'a'.repeat(64));
  assert.equal(findOfficialApkAsset(release('v1.0.301', {assets:[]})), null);
  assert.equal(findOfficialApkAsset(release('v1.0.301', {draft:true})), null);
  assert.equal(findOfficialApkAsset(release('v1.0.301', {prerelease:true})), null);
  const wrongHost = release();
  wrongHost.assets[0].browser_download_url = 'https://example.com/fake.apk';
  assert.equal(findOfficialApkAsset(wrongHost), null);
  const wrongName = release();
  wrongName.assets[0].name = 'debug.apk';
  assert.equal(findOfficialApkAsset(wrongName), null);
});

test('latest release lookup retries while GitHub is still attaching the APK', async () => {
  let calls = 0;
  const result = await fetchLatestRelease({
    repo,
    attempts: 3,
    sleepImpl: async () => {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ++calls < 2 ? release('v1.0.302', {assets:[]}) : release('v1.0.302')
    })
  });
  assert.equal(calls, 2);
  assert.equal(result.version.code, 302);
  assert.equal(result.apk.sha256, 'a'.repeat(64));
});

test('missing APK after bounded retries returns a distinct publishing error', async () => {
  await assert.rejects(
    fetchLatestRelease({
      repo,
      attempts: 2,
      sleepImpl: async () => {},
      fetchImpl: async () => ({ok:true,status:200,json:async()=>release('v1.0.302',{assets:[]})})
    }),
    error => error?.code === 'RELEASE_ASSET_PENDING'
  );
});

test('GitHub API errors are not misreported as a missing APK', async () => {
  await assert.rejects(
    fetchLatestRelease({repo,fetchImpl:async()=>({ok:false,status:403})}),
    error => error?.code === 'UPDATE_RATE_LIMIT'
  );
});
