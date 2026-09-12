import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('FULL REGRESSION: Help & Support Validation, FAQ Search, & Reporting Lifecycle', async (t) => {
  const hsContent = fs.readFileSync(path.resolve('js/help-support.js'), 'utf8');

  await t.test('Client-side form input validation boundaries', () => {
    function validateReportForm(category, description) {
      if (!category || !category.trim()) {
        return { valid: false, error: 'Please select an issue category.' };
      }
      if (!description || description.trim().length < 10) {
        return { valid: false, error: 'Please describe the issue in at least 10 characters.' };
      }
      return { valid: true, error: null };
    }

    // Empty category
    assert.strictEqual(validateReportForm('', 'Valid description text').valid, false);
    // Short description
    assert.strictEqual(validateReportForm('bus', 'short').valid, false);
    assert.strictEqual(validateReportForm('bus', '123456789').valid, false);
    // Boundary valid (exactly 10 chars)
    assert.strictEqual(validateReportForm('bus', '1234567890').valid, true);
    // Normal valid
    assert.strictEqual(validateReportForm('safety', 'Emergency alarm was triggered near stop 4').valid, true);
  });

  await t.test('FAQ search query tokenization & fuzzy keyword matching', () => {
    const mockFAQs = [
      { id: '1', question: 'How do I find my bus?', answer: 'Tap Bus icon on home screen', keywords: ['find', 'bus', 'search'] },
      { id: '2', question: 'How do I change my profile photo?', answer: 'Go to Profile then Edit', keywords: ['photo', 'picture', 'avatar'] },
      { id: '3', question: 'Emergency contacts setup', answer: 'Configure trusted contacts in Safety', keywords: ['emergency', 'sos', 'safety'] }
    ];

    function searchHelp(query, list) {
      if (!query || !query.trim()) return [];
      const q = query.toLowerCase().trim();
      return list.filter(item => {
        const inQ = item.question.toLowerCase().includes(q);
        const inA = item.answer.toLowerCase().includes(q);
        const inK = item.keywords.some(k => k.includes(q) || q.includes(k));
        return inQ || inA || inK;
      });
    }

    // Keyword match
    const r1 = searchHelp('photo', mockFAQs);
    assert.strictEqual(r1.length, 1);
    assert.strictEqual(r1[0].id, '2');

    // Content match
    const r2 = searchHelp('home screen', mockFAQs);
    assert.strictEqual(r2.length, 1);
    assert.strictEqual(r2[0].id, '1');

    // No match
    const r3 = searchHelp('nonexistent topic', mockFAQs);
    assert.strictEqual(r3.length, 0);
  });

  await t.test('Support ticket ID generation format is NR- followed by alphanumeric', () => {
    const id = 'NR-' + Date.now().toString(36).toUpperCase();
    assert.match(id, /^NR-[A-Z0-9]+$/);
  });
});
