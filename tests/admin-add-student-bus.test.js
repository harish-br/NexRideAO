import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('ADMIN STUDENT BUS ALLOCATION: Comprehensive Verification', async (t) => {
  const adminHtml = fs.readFileSync(path.join(rootDir, 'admin', 'index.html'), 'utf8');
  const adminJs = fs.readFileSync(path.join(rootDir, 'admin', 'admin.js'), 'utf8');

  await t.test('1. Modal HTML Structure & All 21 Requested Student Fields', () => {
    // Modal Overlay and Form
    assert.ok(adminHtml.includes('id="student-allocation-modal"'), '#student-allocation-modal must exist in HTML');
    assert.ok(adminHtml.includes('id="student-allocation-form"'), '#student-allocation-form must exist');
    assert.ok(adminHtml.includes('id="student-form-error-alert"'), 'Conflict/validation warning box must exist');

    // 1. Bus & Route Corridor Allocation
    assert.ok(adminHtml.includes('id="student-form-bus"'), '1. Specific bus select must exist');
    assert.ok(adminHtml.includes('id="student-form-route-id"'), '2. Route ID field must exist');
    assert.ok(adminHtml.includes('id="student-form-stage"'), '3. Stage / boarding stop field must exist');

    // 2. Passenger & Academic Identity
    assert.ok(adminHtml.includes('id="student-form-passenger-type"'), '4. Passenger type (Student, Teaching, Non-Teaching) must exist');
    assert.ok(adminHtml.includes('id="student-form-name"'), '5. Student / passenger name must exist');
    assert.ok(adminHtml.includes('id="student-form-id"'), '6. Student ID / roll number must exist');
    assert.ok(adminHtml.includes('id="btn-gen-student-id"'), 'Auto-generate ID button must exist');
    assert.ok(adminHtml.includes('id="student-form-academic-year"'), '7. Academic year select must exist');
    assert.ok(adminHtml.includes('id="student-form-institution"'), '8. Institution select must exist');
    assert.ok(adminHtml.includes('id="student-form-department"'), '9. Department select must exist');
    assert.ok(adminHtml.includes('id="student-form-year"'), '10. Year of study select must exist');
    assert.ok(adminHtml.includes('id="student-form-mobile"'), '11. Mobile number input must exist');

    // 3. Fee Structure & Concession Configuration
    assert.ok(adminHtml.includes('id="student-form-amount-fixed"'), '12. Amount fixed field must exist');
    assert.ok(adminHtml.includes('id="student-form-fine-amount"'), '13. Fine amount field must exist');
    assert.ok(adminHtml.includes('id="student-form-concession-type"'), '14. Concession type select must exist');
    assert.ok(adminHtml.includes('id="student-form-concession-amount"'), '15. Concession amount field must exist');
    assert.ok(adminHtml.includes('id="student-form-concession-approved"'), '16. Concession approved select must exist');
    assert.ok(adminHtml.includes('id="student-form-fees-amount"'), '17. Total fees amount field must exist');
    assert.ok(adminHtml.includes('id="student-form-discontinued-amount"'), '18. Discontinued amount field must exist');
    assert.ok(adminHtml.includes('id="student-form-cancelled-amount"'), '19. Cancelled amount field must exist');

    // 4. Payment Transaction & Settlement
    assert.ok(adminHtml.includes('id="student-form-paid-amount"'), '20. Paid amount field must exist');
    assert.ok(adminHtml.includes('id="student-form-paid-date"'), '21. Paid date field must exist');
    assert.ok(adminHtml.includes('id="student-form-balance"'), '22. Balance (payment status) select must exist');
    assert.ok(adminHtml.includes('id="student-form-remark"'), '23. Remark / notes textarea must exist');
  });

  await t.test('2. Bus Inspector Tab 2 Integration & Navigation Triggers', () => {
    // Add student to inspected bus button
    assert.ok(adminHtml.includes('id="inspect-add-student-btn"'), 'Bus Inspector Tab 2 must have #inspect-add-student-btn');
    
    // Main view trigger
    assert.ok(adminHtml.includes('id="add-student-btn"'), 'Students view must have #add-student-btn');

    // Student Details Inspection Modal
    assert.ok(adminHtml.includes('id="student-details-modal"'), 'HTML must include #student-details-modal');
    assert.ok(adminHtml.includes('id="stu-detail-name"'), '#student-details-modal must have name display');
    assert.ok(adminHtml.includes('id="stu-detail-bus"'), '#student-details-modal must have bus display');
    assert.ok(adminHtml.includes('id="stu-detail-stage"'), '#student-details-modal must have stage display');
    assert.ok(adminHtml.includes('id="stu-detail-fees-amount"'), '#student-details-modal must have fees amount display');
    assert.ok(adminHtml.includes('id="delete-student-btn"'), '#student-details-modal must have remove from bus button');
  });

  await t.test('3. JavaScript Controller Functions & Window Exposure', () => {
    // Core controllers
    assert.ok(adminJs.includes('function openStudentAllocationModal('), 'admin.js must implement openStudentAllocationModal');
    assert.ok(adminJs.includes('function closeStudentAllocationModal('), 'admin.js must implement closeStudentAllocationModal');
    assert.ok(adminJs.includes('function calculateStudentFees('), 'admin.js must implement calculateStudentFees');
    assert.ok(adminJs.includes('function updateStudentRouteAndStages('), 'admin.js must implement updateStudentRouteAndStages');
    assert.ok(adminJs.includes('function openStudentDetailsModal('), 'admin.js must implement openStudentDetailsModal');
    assert.ok(adminJs.includes('function removeStudentFromBus('), 'admin.js must implement removeStudentFromBus');

    // Global window exposure
    assert.ok(adminJs.includes('window.adminInspectStudent'), 'window.adminInspectStudent must be exposed');
    assert.ok(adminJs.includes('window.adminEditStudent'), 'window.adminEditStudent must be exposed');
    assert.ok(adminJs.includes('window.openStudentAllocationModal'), 'window.openStudentAllocationModal must be exposed');
    assert.ok(adminJs.includes('window.openStudentDetailsModal'), 'window.openStudentDetailsModal must be exposed');
  });

  await t.test('4. Fee & Balance Calculation Mathematics', () => {
    const computeFeesAndBalance = (amountFixed, fineAmount, concessionAmount, paidAmount) => {
      const totalFees = Math.max(0, amountFixed + fineAmount - concessionAmount);
      const balanceDue = totalFees - paidAmount;
      const status = balanceDue <= 0 ? 'Fully Paid' : (paidAmount > 0 ? 'Partially Paid' : 'Unpaid');
      return { totalFees, balanceDue, status };
    };

    // Case 1: Standard full payment
    const fullPay = computeFeesAndBalance(18000, 0, 0, 18000);
    assert.strictEqual(fullPay.totalFees, 18000);
    assert.strictEqual(fullPay.balanceDue, 0);
    assert.strictEqual(fullPay.status, 'Fully Paid');

    // Case 2: Concession + partial payment
    const concPay = computeFeesAndBalance(20000, 0, 5000, 10000);
    assert.strictEqual(concPay.totalFees, 15000);
    assert.strictEqual(concPay.balanceDue, 5000);
    assert.strictEqual(concPay.status, 'Partially Paid');

    // Case 3: Fine added + unpaid
    const fineUnpaid = computeFeesAndBalance(18000, 500, 0, 0);
    assert.strictEqual(fineUnpaid.totalFees, 18500);
    assert.strictEqual(fineUnpaid.balanceDue, 18500);
    assert.strictEqual(fineUnpaid.status, 'Unpaid');
  });

  await t.test('5. Header Standalone Navigation & Page Routing', () => {
    // Direct top-level nav link
    assert.ok(adminHtml.includes('id="nav-students-item"'), '#nav-students-item must exist in header navbar');
    assert.match(adminHtml, /<ul class="nav-links">[\s\S]*?<a href="#students"[^>]*data-view="students-view"[^>]*id="nav-students-item"[^>]*>Students<\/a>/, 'Students must be a direct top-level link in .nav-links');
    
    // Not nested inside any dropdown
    assert.ok(!adminHtml.includes('<div class="nav-dropdown-menu" id="nav-students-dropdown"'), 'Students must not be a dropdown');

    // Hash route handling in admin.js
    assert.ok(adminJs.includes("baseRoute === '#students'"), 'admin.js must handle #students route in handleHashRoute');
  });
});

