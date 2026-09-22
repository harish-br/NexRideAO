import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('GLOBAL SEARCH VISIBILITY: Search results text styling, visibility & click contracts', async (t) => {
  const cssPath = path.resolve('admin/admin.css');
  const jsPath = path.resolve('admin/admin.js');
  const htmlPath = path.resolve('admin/index.html');

  assert.ok(fs.existsSync(cssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(jsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(htmlPath), 'admin/index.html must exist');

  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');
  const html = fs.readFileSync(htmlPath, 'utf8');

  await t.test('1. Admin CSS prevents white-on-white text inheritance for search results', () => {
    // Top navbar sets color: var(--nav-text) which is white. Search box must explicitly declare dark text color.
    assert.match(
      css,
      /\.search-results-box\s*\{[^}]*color:\s*(#111827|var\(--text-primary\))\s*!important/s,
      '.search-results-box must declare explicit dark color with !important to prevent navbar white text inheritance'
    );

    // .search-item and inner text elements must have dark colors
    assert.match(
      css,
      /\.search-item\s*\{[^}]*color:\s*#1F2937\s*!important/s,
      '.search-item must specify dark color #1F2937 !important'
    );

    assert.match(
      css,
      /\.search-item strong\s*\{[^}]*color:\s*#111827\s*!important/s,
      '.search-item strong must specify high contrast bold text color'
    );

    assert.match(
      css,
      /\.search-category-title\s*\{[^}]*color:\s*var\(--text-muted,\s*#6B7280\)\s*!important/s,
      '.search-category-title must be styled with muted dark text'
    );
  });

  await t.test('2. Search results box positioning is properly anchored to the search bar', () => {
    assert.match(
      css,
      /\.search-results-box\s*\{[^}]*top:\s*calc\(100%\s*\+\s*8px\)/s,
      '.search-results-box must use dynamic calc(100% + 8px) positioning'
    );

    assert.match(
      css,
      /\.search-results-box\s*\{[^}]*right:\s*0/s,
      '.search-results-box must anchor to the right edge of the search bar'
    );
  });

  await t.test('3. JavaScript search generation safely escapes inputs and structures text elements', () => {
    // Must contain search-item-info container
    assert.match(
      js,
      /class="search-item-info"/,
      'admin.js must generate search items with class="search-item-info"'
    );

    // Preserves data-action contracts
    assert.match(js, /data-action="inspect-route"/, 'Must support inspect-route action');
    assert.match(js, /data-action="inspect-bus"/, 'Must support inspect-bus action');
    assert.match(js, /data-action="assign-driver"/, 'Must support assign-driver action');
    assert.match(js, /data-action="open-ticket"/, 'Must support open-ticket action');

    // Query escaping in no-results
    assert.match(
      js,
      /No results found for "\$\{escapeHtml\(q\)\}"/,
      'Query in no results message must be safely escaped'
    );
  });

  await t.test('4. Admin HTML includes global search input and results container', () => {
    assert.match(html, /id="global-search-input"/, 'index.html must include global-search-input');
    assert.match(html, /id="global-search-results"/, 'index.html must include global-search-results');
  });
});
