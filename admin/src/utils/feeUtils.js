/**
 * Shared utility for calculating student fee details, total payable,
 * pending amount, and fee status across the entire application.
 */

export function getStudentFeeSummary(student) {
  if (!student) {
    return {
      fixed: 0,
      fine: 0,
      totalRequired: 0,
      paid: 0,
      pending: 0,
      status: 'Not Paid'
    };
  }

  // 1. Fixed Fee Amount:
  // If amountFixed is explicitly set and > 0, use it.
  // Otherwise, if feesTotal is provided, subtract concessionAmount if applicable.
  let fixed = 0;
  if (student.amountFixed !== undefined && student.amountFixed !== '' && Number(student.amountFixed) > 0) {
    fixed = Number(student.amountFixed);
  } else if (Number(student.feesTotal) > 0) {
    const total = Number(student.feesTotal);
    const concession = Number(student.concessionAmount) || 0;
    fixed = Math.max(0, total - concession);
  }

  // 2. Fine Amount (if any)
  const fine = Number(student.fineAmount) || 0;

  // 3. Total required amount = Fixed amount + Fine amount
  const totalRequired = fixed + fine;

  // 4. Paid Amount
  const paid = Number(student.paidAmount) || 0;

  // 5. Pending Amount:
  // If explicitly specified in student data and non-empty, use that; otherwise calculate totalRequired - paid
  let pending = 0;
  if (student.pendingAmount !== undefined && student.pendingAmount !== '' && student.pendingAmount !== null) {
    pending = Math.max(0, Number(student.pendingAmount));
  } else {
    pending = Math.max(0, totalRequired - paid);
  }

  // 6. Fee Status:
  // - If paid >= totalRequired, or (pending <= 0 and paid > 0): Paid
  // - If paid > 0 and paid < totalRequired (or pending > 0): Pending
  // - If paid === 0: Not Paid
  let status = 'Not Paid';
  if (totalRequired > 0) {
    if (paid >= totalRequired || (pending <= 0 && paid > 0)) {
      status = 'Paid';
    } else if (paid > 0 && paid < totalRequired) {
      status = 'Pending';
    } else {
      status = 'Not Paid';
    }
  } else if (paid > 0) {
    status = 'Paid';
  } else {
    status = 'Not Paid';
  }

  return {
    fixed,
    fine,
    totalRequired,
    paid,
    pending,
    status
  };
}

export function getFeeStatusColor(status) {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
    case 'fully paid':
      return '#16A34A';
    case 'pending':
      return '#D97706';
    case 'not paid':
    case 'unpaid':
    case 'overdue':
      return '#DC2626';
    default:
      return '#6B7280';
  }
}
