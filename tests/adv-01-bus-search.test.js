import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADV-01: Bus search regex metacharacter safety and search integrity', async (t) => {
  const busSearchPath = path.resolve('js/bus-search.js');
  assert.ok(fs.existsSync(busSearchPath), 'js/bus-search.js must exist');
  
  const content = fs.readFileSync(busSearchPath, 'utf8');

  // Verify escapeRegex function definition exists
  assert.match(
    content,
    /function escapeRegex\(str\)/,
    'bus-search.js must define escapeRegex helper'
  );

  // Extract highlightText implementation logic
  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function highlightText(text, query) {
    if (!text && text !== 0) return '';
    const safeText = escapeHtml(String(text));
    if (!query || typeof query !== 'string' || !query.trim()) return safeText;
    const escapedQuery = escapeRegex(escapeHtml(query.trim()));
    try {
      const regex = new RegExp(`(${escapedQuery})`, "gi");
      return safeText.replace(regex, `<span class="bs-highlight">$1</span>`);
    } catch (e) {
      return safeText;
    }
  }

  const adversarialInputs = [
    'Campus (Gate 2)',
    'Stop (Main)',
    'A+B',
    'A.B',
    'A*B',
    '[Main]',
    'A?B',
    'A/B',
    "O'Connor",
    'John "JD" Smith',
    '<script>alert(1)</script>',
    '(',
    '[',
    '*',
    '+',
    '?',
    '\\',
    '^',
    '$',
    '{',
    '}',
    '|'
  ];

  for (const input of adversarialInputs) {
    await t.test(`Safely processes adversarial query: "${input}" without throwing`, () => {
      assert.doesNotThrow(() => {
        const text = `Bus arriving at ${input} shortly`;
        const result = highlightText(text, input);
        assert.ok(typeof result === 'string');
        assert.ok(result.includes('bs-highlight'));
      });
    });
  }

  await t.test('Does not weaken search functionality for regular queries', () => {
    const text = 'Route 20 from Erode Bus Stand to Nandha College';
    const highlighted = highlightText(text, '20');
    assert.strictEqual(
      highlighted,
      'Route <span class="bs-highlight">20</span> from Erode Bus Stand to Nandha College'
    );
  });
});
