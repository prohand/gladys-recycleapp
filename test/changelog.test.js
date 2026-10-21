import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-recycleapp';

test('the Unreleased section moves under the version, the links follow', () => {
  const before = [
    '# Changelog',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '',
    '- Something.',
    '',
    `[Unreleased]: ${REPO}/commits/main`,
    '',
  ].join('\n');
  const after = rollChangelog(before, '1.0.0', '2026-10-21');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-21\n\n### Added\n\n- Something\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));

  const next = rollChangelog(after, '1.0.1', '2026-10-22');
  assert.match(next, /## \[1\.0\.1\] - 2026-10-22\n\n- Maintenance release/);
  assert.match(next, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('a version already written or a file without Unreleased is left untouched', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-10-21\n';
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-22'), text);
  assert.equal(rollChangelog('# Changelog\n', '1.0.0', '2026-10-22'), '# Changelog\n');
});
