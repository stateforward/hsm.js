const test = require('node:test');
const assert = require('node:assert');
const hsm = require('../src/hsm.js');

// Destructure the path utilities we'll be testing
const { join, dirname, isAbsolute } = hsm;

test('Path utilities - join() edge cases with ".." segments', function () {
    // Basic parent directory navigation
    assert.strictEqual(join('a', '..'), '.');
    assert.strictEqual(join('a/b', '..'), 'a');
    assert.strictEqual(join('a/b/c', '..'), 'a/b');
    assert.strictEqual(join('a/b', '../..'), '.');
    assert.strictEqual(join('a/b/c', '../..'), 'a');

    // Parent directory at the start
    assert.strictEqual(join('..'), '..');
    assert.strictEqual(join('../..'), '../..');
    assert.strictEqual(join('..', 'a'), '../a');
    assert.strictEqual(join('..', '..', 'a'), '../../a');

    // Mixed navigation
    assert.strictEqual(join('a', '..', 'b'), 'b');
    assert.strictEqual(join('a', 'b', '..', 'c'), 'a/c');
    assert.strictEqual(join('a', 'b', '..', '..', 'c'), 'c');

    // Absolute paths with parent navigation
    assert.strictEqual(join('/', '..'), '/');
    assert.strictEqual(join('/a', '..'), '/');
    assert.strictEqual(join('/a/b', '..'), '/a');
    assert.strictEqual(join('/a/b', '../..'), '/');
    assert.strictEqual(join('/a/b/c', '../..'), '/a');

    // Cannot go above root
    assert.strictEqual(join('/', '..', '..', '..'), '/');
    assert.strictEqual(join('/a', '..', '..', '..'), '/');
});

test('Path utilities - join() edge cases with "..foo" and "../..foo" patterns', function () {
    // Names starting with ".."
    assert.strictEqual(join('..foo'), '..foo');
    assert.strictEqual(join('a', '..foo'), 'a/..foo');
    assert.strictEqual(join('/a', '..foo'), '/a/..foo');
    assert.strictEqual(join('..', '..foo'), '../..foo');

    // Complex patterns
    assert.strictEqual(join('..foo', 'bar'), '..foo/bar');
    assert.strictEqual(join('a', '..foo', 'bar'), 'a/..foo/bar');
    assert.strictEqual(join('..foo', '..'), '.');
    assert.strictEqual(join('a', '..foo', '..'), 'a');

    // Edge cases with multiple dots
    assert.strictEqual(join('...foo'), '...foo');
    assert.strictEqual(join('....foo'), '....foo');
    assert.strictEqual(join('a', '...foo'), 'a/...foo');
    assert.strictEqual(join('a', '....foo'), 'a/....foo');

    // Mixed patterns
    assert.strictEqual(join('../..foo'), '../..foo');
    assert.strictEqual(join('../../..foo'), '../../..foo');
    assert.strictEqual(join('a', '../..foo'), '..foo');
    assert.strictEqual(join('a/b', '../../..foo'), '..foo');
});

test('Path utilities - join() edge cases with ".." and "../" combinations', function () {
    // Trailing slashes with parent navigation
    assert.strictEqual(join('a', '../'), '.');
    assert.strictEqual(join('a/b', '../'), 'a/');
    assert.strictEqual(join('a/b', '../../'), '.');  // Fixed: returns '.' not './'
    assert.strictEqual(join('a', '../b/'), 'b/');

    // Absolute paths with trailing slashes
    assert.strictEqual(join('/a', '../'), '/');
    assert.strictEqual(join('/a/b', '../'), '/a/');
    assert.strictEqual(join('/a/b', '../../'), '/');

    // Complex combinations
    assert.strictEqual(join('../'), '../');
    assert.strictEqual(join('..', '/'), '/');
    assert.strictEqual(join('../', 'a'), '../a');
    assert.strictEqual(join('../', '../'), '../../');
    assert.strictEqual(join('../', '..'), '../..');
});

test('Path utilities - join() edge cases with empty and null/undefined segments', function () {
    // Empty strings
    assert.strictEqual(join(''), '.');
    assert.strictEqual(join('', ''), '.');
    assert.strictEqual(join('a', ''), 'a');
    assert.strictEqual(join('', 'a'), 'a');
    assert.strictEqual(join('a', '', 'b'), 'a/b');

    // Null and undefined (should be skipped)
    assert.strictEqual(join(null), '.');
    assert.strictEqual(join(undefined), '.');
    assert.strictEqual(join('a', null, 'b'), 'a/b');
    assert.strictEqual(join('a', undefined, 'b'), 'a/b');
    assert.strictEqual(join(null, 'a', undefined, 'b'), 'a/b');

    // Mixed with other edge cases
    assert.strictEqual(join('', '..'), '..');
    assert.strictEqual(join(null, '..', undefined, 'a'), '../a');
});

test('Path utilities - join() edge cases with current directory "."', function () {
    // Single dot
    assert.strictEqual(join('.'), '.');
    assert.strictEqual(join('.', '.'), '.');
    assert.strictEqual(join('a', '.'), 'a');
    assert.strictEqual(join('.', 'a'), 'a');
    assert.strictEqual(join('a', '.', 'b'), 'a/b');

    // Mixed with parent navigation
    assert.strictEqual(join('.', '..'), '..');
    assert.strictEqual(join('..', '.'), '..');
    assert.strictEqual(join('a', '.', '..'), '.');
    assert.strictEqual(join('.', 'a', '..'), '.');

    // With absolute paths
    assert.strictEqual(join('/', '.'), '/');
    assert.strictEqual(join('/a', '.'), '/a');
    assert.strictEqual(join('/a', '.', 'b'), '/a/b');

    // Names containing dots
    assert.strictEqual(join('.foo'), '.foo');
    assert.strictEqual(join('a', '.foo'), 'a/.foo');
    assert.strictEqual(join('.foo', 'bar'), '.foo/bar');
    assert.strictEqual(join('..foo', '.bar'), '..foo/.bar');
});

test('Path utilities - join() edge cases with multiple consecutive slashes', function () {
    // Multiple slashes
    assert.strictEqual(join('a//b'), 'a/b');
    assert.strictEqual(join('a///b'), 'a/b');
    assert.strictEqual(join('a/', '/b'), '/b');
    assert.strictEqual(join('a//', '//b'), '/b');  // Fixed: absolute path resets

    // Leading multiple slashes - normalized to single slash
    assert.strictEqual(join('//a'), '/a');
    assert.strictEqual(join('///a'), '/a');
    assert.strictEqual(join('//a', 'b'), '/a/b');

    // Trailing multiple slashes
    assert.strictEqual(join('a//'), 'a/');
    assert.strictEqual(join('a///'), 'a/');
    assert.strictEqual(join('a//', 'b'), 'a/b');

    // Mixed with parent navigation
    assert.strictEqual(join('a//b', '..'), 'a');
    assert.strictEqual(join('a///b//c', '../..'), 'a');
});

test('Path utilities - join() with absolute path resets', function () {
    // Absolute path in middle resets everything
    assert.strictEqual(join('a', 'b', '/c'), '/c');
    assert.strictEqual(join('a', 'b', '/c', 'd'), '/c/d');
    assert.strictEqual(join('/a', 'b', '/c'), '/c');
    assert.strictEqual(join('../a', 'b', '/c'), '/c');

    // Multiple absolute paths
    assert.strictEqual(join('/a', '/b', '/c'), '/c');
    assert.strictEqual(join('a', '/b', 'c', '/d'), '/d');

    // Absolute paths with parent navigation
    assert.strictEqual(join('a', '/b', '..'), '/');
    assert.strictEqual(join('a', '/b/c', '..'), '/b');
    assert.strictEqual(join('a', '/b', '..', 'c'), '/c');
    assert.strictEqual(join('/a/b/c', '/a/d/e'), '/a/d/e');
    assert.strictEqual(join('/a/b/c', 'd/e/f'), '/a/b/c/d/e/f');
});

test('Path utilities - dirname() edge cases', function () {
    // Edge cases with dots
    assert.strictEqual(dirname('.'), '.');
    assert.strictEqual(dirname('..'), '.');
    assert.strictEqual(dirname('../..'), '..');
    assert.strictEqual(dirname('../../a'), '../..');

    // Files/dirs starting with dots
    assert.strictEqual(dirname('.foo'), '.');
    assert.strictEqual(dirname('..foo'), '.');
    assert.strictEqual(dirname('a/.foo'), 'a');
    assert.strictEqual(dirname('a/..foo'), 'a');
    assert.strictEqual(dirname('/a/.foo'), '/a');
    assert.strictEqual(dirname('/a/..foo'), '/a');

    // Complex dot patterns
    assert.strictEqual(dirname('a/.foo/bar'), 'a/.foo');
    assert.strictEqual(dirname('a/..foo/bar'), 'a/..foo');
    assert.strictEqual(dirname('../.foo'), '..');
    assert.strictEqual(dirname('../..foo'), '..');

    // Empty and null cases
    assert.strictEqual(dirname(''), '.');
    assert.strictEqual(dirname(null), '.');
    assert.strictEqual(dirname(undefined), '.');

    // Multiple slashes - dirname removes trailing slashes first
    assert.strictEqual(dirname('a//b'), 'a/');  // Fixed: preserves the slashes in parent
    assert.strictEqual(dirname('a///b'), 'a//');  // Fixed: preserves the slashes in parent
    assert.strictEqual(dirname('//a'), '/');
    assert.strictEqual(dirname('///a'), '//');

    // Root edge cases - multiple slashes normalized
    assert.strictEqual(dirname('/'), '/');
    assert.strictEqual(dirname('//'), '/');
    assert.strictEqual(dirname('///'), '/');
});

test('Path utilities - isAbsolute() edge cases', function () {
    // Unix style
    assert.strictEqual(isAbsolute('/'), true);
    assert.strictEqual(isAbsolute('//'), true);
    assert.strictEqual(isAbsolute('///'), true);
    assert.strictEqual(isAbsolute('/a'), true);
    assert.strictEqual(isAbsolute('/.'), true);
    assert.strictEqual(isAbsolute('/..'), true);
    assert.strictEqual(isAbsolute('/.foo'), true);
    assert.strictEqual(isAbsolute('/..foo'), true);

    // Windows style
    assert.strictEqual(isAbsolute('C:/'), true);
    assert.strictEqual(isAbsolute('C://'), true);
    assert.strictEqual(isAbsolute('D:/path'), true);
    assert.strictEqual(isAbsolute('Z:/'), true);

    // Not absolute
    assert.strictEqual(isAbsolute(''), false);
    assert.strictEqual(isAbsolute('.'), false);
    assert.strictEqual(isAbsolute('..'), false);
    assert.strictEqual(isAbsolute('a'), false);
    assert.strictEqual(isAbsolute('./a'), false);
    assert.strictEqual(isAbsolute('../a'), false);
    assert.strictEqual(isAbsolute('C:'), false); // Missing slash
    assert.strictEqual(isAbsolute('C:\\'), false); // Wrong slash type
    assert.strictEqual(isAbsolute('/C:'), true); // Unix path that happens to have C:

    // Edge cases with special characters
    assert.strictEqual(isAbsolute('.foo'), false);
    assert.strictEqual(isAbsolute('..foo'), false);
    assert.strictEqual(isAbsolute('...foo'), false);
    assert.strictEqual(isAbsolute(' /path'), false); // Leading space
    assert.strictEqual(isAbsolute('\t/path'), false); // Leading tab
});

test('Path utilities - Complex real-world scenarios', function () {
    // Simulating state machine hierarchies
    assert.strictEqual(join('/machine', 'state1'), '/machine/state1');
    assert.strictEqual(join('/machine/state1', '../state2'), '/machine/state2');
    assert.strictEqual(join('/machine/state1/substate', '../../state2'), '/machine/state2');
    assert.strictEqual(join('/machine/state1', '../..'), '/');

    // Relative navigation from nested states
    assert.strictEqual(join('machine/state1/substate', '../sibling'), 'machine/state1/sibling');
    assert.strictEqual(join('machine/state1/substate', '../../state2/substate'), 'machine/state2/substate');

    // Edge case: names that look like navigation
    assert.strictEqual(join('/states', '..state'), '/states/..state');
    assert.strictEqual(join('/states', '..state', 'child'), '/states/..state/child');
    assert.strictEqual(join('/states/..state', '..'), '/states');

    // Complex mixed scenarios
    assert.strictEqual(join('a/b', '..', '..c', 'd', '..', 'e'), 'a/..c/e');
    assert.strictEqual(join('/a/b', '.', '..', '.', 'c'), '/a/c');
    assert.strictEqual(join('..', 'a', '..', '..', 'b'), '../../b');
});

test('Path utilities - Performance edge cases (long paths)', function () {
    // Very deep paths
    const deepPath = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p';
    const manyParents = '../../../../../../../../../../../../../..';
    assert.strictEqual(join(deepPath, manyParents), 'a/b');

    // Many segments
    const segments = new Array(100).fill('segment');
    const result = join(...segments);
    assert.strictEqual(result, segments.join('/'));

    // Many parent navigations
    const parents = new Array(50).fill('..');
    const parentsResult = join(...parents);
    assert.strictEqual(parentsResult, parents.join('/'));

    // Mixed complex navigation
    const complex = ['a', 'b', '..', 'c', '..', 'd', '..', 'e'];
    assert.strictEqual(join(...complex), 'a/e');
});

test('Path utilities - Unicode and special characters', function () {
    // Unicode in paths
    assert.strictEqual(join('文件夹', '文件'), '文件夹/文件');
    assert.strictEqual(join('📁', '📄'), '📁/📄');
    assert.strictEqual(dirname('文件夹/文件'), '文件夹');
    assert.strictEqual(isAbsolute('/文件夹'), true);

    // Special characters that might be problematic
    assert.strictEqual(join('a b', 'c d'), 'a b/c d'); // Spaces
    assert.strictEqual(join('a\tb', 'c\td'), 'a\tb/c\td'); // Tabs
    assert.strictEqual(join('a$b', 'c#d'), 'a$b/c#d'); // Special chars

    // Names with dots and special patterns
    assert.strictEqual(join('node_modules', '.bin'), 'node_modules/.bin');
    assert.strictEqual(join('..gitignore'), '..gitignore');
    assert.strictEqual(join('...eslintrc'), '...eslintrc');
});

// Run tests and provide summary
test.after(() => {
    console.log('\nPath utilities edge case testing complete.');
    console.log('Covered scenarios:');
    console.log('- Parent directory navigation (..)');
    console.log('- Files/directories starting with .. (..foo)');
    console.log('- Mixed . and .. patterns');
    console.log('- Empty and null/undefined handling');
    console.log('- Multiple consecutive slashes');
    console.log('- Absolute path resets');
    console.log('- Complex real-world scenarios');
    console.log('- Performance edge cases');
    console.log('- Unicode and special characters');
});