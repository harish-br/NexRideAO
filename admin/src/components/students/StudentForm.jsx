import React, { useState } from 'react';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { getStudentFeeSummary, getFeeStatusColor } from '../../utils/feeUtils';

const inputStyle = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box'
};

const FormGroup = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{label}</label>
    {children}
  </div>
);

const SectionHeader = ({ title }) => (
  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111', margin: '24px 0 16px 0', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
    {title}
  </h3>
);

export default function StudentForm({ student, onBack, onSaveComplete }) {
  const isEdit = !!student;
  
  const [formData, setFormData] = useState({
    // Academic Details
    academicYear: student?.academicYear || '',
    institution: student?.institution || 'NEC',
    department: student?.department || '',
    year: student?.year || 'I',
    
    // Personal Details
    applicationNumber: student?.applicationNumber || '',
    studentName: student?.studentName || '',
    phoneNumber: student?.phoneNumber || '',
    passengerType: student?.passengerType || 'Student',
    
    // Transport Details
    routeNumber: student?.routeNumber || '',
    routeId: student?.routeId || '',
    stage: student?.stage || '',
    
    // Fees & Concession
    feesTotal: student?.feesTotal !== undefined && student?.feesTotal !== null ? student.feesTotal : '',
    concessionType: student?.concessionType || '',
    concessionAmount: student?.concessionAmount !== undefined && student?.concessionAmount !== null ? student.concessionAmount : '',
    concessionApproved: student?.concessionApproved || 'No',
    amountFixed: student?.amountFixed !== undefined && student?.amountFixed !== null ? student.amountFixed : '',
    printout: student?.printout || 'No',
    remark: student?.remark || '',
    
    // Payment Tracking
    paidAmount: student?.paidAmount !== undefined && student?.paidAmount !== null ? student.paidAmount : '',
    paidDate: student?.paidDate || '',
    pendingAmount: student?.pendingAmount !== undefined && student?.pendingAmount !== null ? student.pendingAmount : '',
    fineAmount: student?.fineAmount !== undefined && student?.fineAmount !== null ? student.fineAmount : '',
    discontinueAmount: student?.discontinueAmount || '',
    cancelledAmount: student?.cancelledAmount || ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Derived current fee summary
  const derivedFee = getStudentFeeSummary(formData);

  // Synchronized field change handlers
  const handleFeesTotalChange = (val) => {
    const total = val === '' ? '' : Number(val);
    const concession = formData.concessionAmount === '' ? 0 : Number(formData.concessionAmount);
    const newFixed = total !== '' ? Math.max(0, total - concession) : '';

    setFormData(prev => {
      const nextFixed = (prev.amountFixed === '' || prev.amountFixed === undefined) ? newFixed : prev.amountFixed;
      const fine = Number(prev.fineAmount) || 0;
      const target = (Number(nextFixed) || 0) + fine;
      const paid = Number(prev.paidAmount) || 0;
      const pending = Math.max(0, target - paid);
      return {
        ...prev,
        feesTotal: val,
        amountFixed: nextFixed,
        pendingAmount: prev.paidAmount !== '' ? pending : prev.pendingAmount
      };
    });
  };

  const handleConcessionAmountChange = (val) => {
    const total = formData.feesTotal === '' ? 0 : Number(formData.feesTotal);
    const concession = val === '' ? 0 : Number(val);
    const newFixed = Math.max(0, total - concession);

    setFormData(prev => {
      const fine = Number(prev.fineAmount) || 0;
      const target = newFixed + fine;
      const paid = Number(prev.paidAmount) || 0;
      const pending = Math.max(0, target - paid);
      return {
        ...prev,
        concessionAmount: val,
        amountFixed: total > 0 ? newFixed : prev.amountFixed,
        pendingAmount: prev.paidAmount !== '' ? pending : prev.pendingAmount
      };
    });
  };

  const handleConcessionTypeChange = (val) => {
    const num = parseFloat(val);
    const total = Number(formData.feesTotal) || 0;
    if (!isNaN(num) && num > 0 && num <= 1 && total > 0) {
      const concAmt = Math.round(total * num);
      const newFixed = Math.max(0, total - concAmt);
      const fine = Number(formData.fineAmount) || 0;
      const target = newFixed + fine;
      const paid = Number(formData.paidAmount) || 0;
      setFormData(prev => ({
        ...prev,
        concessionType: val,
        concessionAmount: concAmt,
        amountFixed: newFixed,
        pendingAmount: prev.paidAmount !== '' ? Math.max(0, target - paid) : prev.pendingAmount
      }));
    } else {
      setFormData(prev => ({ ...prev, concessionType: val }));
    }
  };

  const handleAmountFixedChange = (val) => {
    const fixed = Number(val) || 0;
    const fine = Number(formData.fineAmount) || 0;
    const target = fixed + fine;
    const paid = Number(formData.paidAmount) || 0;
    const newPending = Math.max(0, target - paid);
    const newStatus = target > 0 && paid >= target ? 'Paid' : (paid > 0 ? 'Pending' : 'Not Paid');

    setFormData(prev => ({
      ...prev,
      amountFixed: val,
      pendingAmount: prev.paidAmount !== '' ? newPending : prev.pendingAmount,
      remark: prev.remark === '' || prev.remark === 'Fully Paid' || prev.remark === 'Not Paid' || prev.remark.startsWith('Pending')
        ? (newStatus === 'Paid' ? 'Fully Paid' : (newStatus === 'Pending' ? `Pending ₹${newPending}` : 'Not Paid'))
        : prev.remark
    }));
  };

  const handleFineAmountChange = (val) => {
    const fixed = Number(formData.amountFixed) > 0 ? Number(formData.amountFixed) : (Number(formData.feesTotal) || 0);
    const fine = Number(val) || 0;
    const target = fixed + fine;
    const paid = Number(formData.paidAmount) || 0;
    const newPending = Math.max(0, target - paid);
    const newStatus = target > 0 && paid >= target ? 'Paid' : (paid > 0 ? 'Pending' : 'Not Paid');

    setFormData(prev => ({
      ...prev,
      fineAmount: val,
      pendingAmount: prev.paidAmount !== '' ? newPending : prev.pendingAmount,
      remark: prev.remark === '' || prev.remark === 'Fully Paid' || prev.remark === 'Not Paid' || prev.remark.startsWith('Pending')
        ? (newStatus === 'Paid' ? 'Fully Paid' : (newStatus === 'Pending' ? `Pending ₹${newPending}` : 'Not Paid'))
        : prev.remark
    }));
  };

  const handlePaidAmountChange = (val) => {
    const fixed = Number(formData.amountFixed) > 0 ? Number(formData.amountFixed) : (Number(formData.feesTotal) || 0);
    const fine = Number(formData.fineAmount) || 0;
    const target = fixed + fine;
    const paid = val === '' ? 0 : Number(val);
    const newPending = Math.max(0, target - paid);
    const newStatus = target > 0 && paid >= target ? 'Paid' : (paid > 0 ? 'Pending' : 'Not Paid');

    setFormData(prev => ({
      ...prev,
      paidAmount: val,
      pendingAmount: val !== '' ? newPending : '',
      remark: prev.remark === '' || prev.remark === 'Fully Paid' || prev.remark === 'Not Paid' || prev.remark.startsWith('Pending')
        ? (newStatus === 'Paid' ? 'Fully Paid' : (newStatus === 'Pending' ? `Pending ₹${newPending}` : 'Not Paid'))
        : prev.remark
    }));
  };

  const handlePendingAmountChange = (val) => {
    const fixed = Number(formData.amountFixed) > 0 ? Number(formData.amountFixed) : (Number(formData.feesTotal) || 0);
    const fine = Number(formData.fineAmount) || 0;
    const target = fixed + fine;
    const pending = val === '' ? 0 : Number(val);
    const newPaid = Math.max(0, target - pending);
    const newStatus = target > 0 && pending <= 0 && newPaid > 0 ? 'Paid' : (newPaid > 0 ? 'Pending' : 'Not Paid');

    setFormData(prev => ({
      ...prev,
      pendingAmount: val,
      paidAmount: val !== '' ? newPaid : prev.paidAmount,
      remark: prev.remark === '' || prev.remark === 'Fully Paid' || prev.remark === 'Not Paid' || prev.remark.startsWith('Pending')
        ? (newStatus === 'Paid' ? 'Fully Paid' : (newStatus === 'Pending' ? `Pending ₹${pending}` : 'Not Paid'))
        : prev.remark
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const feeSummary = getStudentFeeSummary(formData);
      const feesStatus = feeSummary.status; // 'Paid', 'Pending', or 'Not Paid'
      const balanceStatus = feesStatus === 'Paid' ? 'Fully Paid' : (feesStatus === 'Pending' ? `Pending ₹${feeSummary.pending}` : 'Not Paid');

      const studentData = {
        ...formData,
        feesTotal: Number(formData.feesTotal) || 0,
        concessionAmount: Number(formData.concessionAmount) || 0,
        amountFixed: Number(formData.amountFixed) || 0,
        paidAmount: Number(formData.paidAmount) || 0,
        pendingAmount: Number(formData.pendingAmount) !== undefined && formData.pendingAmount !== '' ? Number(formData.pendingAmount) : feeSummary.pending,
        fineAmount: Number(formData.fineAmount) || 0,
        feesAmount: feeSummary.totalRequired,
        fees_amount: feeSummary.totalRequired,
        discontinueAmount: Number(formData.discontinueAmount) || 0,
        cancelledAmount: Number(formData.cancelledAmount) || 0,
        busNumber: formData.routeNumber,
        assignedBus: formData.routeNumber,
        phone: formData.phoneNumber,
        mobile: formData.phoneNumber,
        fees_status: feesStatus,
        feeStatus: feesStatus,
        balance: balanceStatus,
        updatedAt: new Date().toISOString()
      };

      
      let studentDocId = student?.id;
      
      if (isEdit) {
        await updateDoc(doc(db, 'students', studentDocId), studentData);
      } else {
        studentData.createdAt = new Date().toISOString();
        studentDocId = `student_${formData.applicationNumber || Date.now()}`;
        await setDoc(doc(db, 'students', studentDocId), studentData);
      }
      
      // CRITICAL FALLBACK: Save a tiny reference in 'users' collection using the phone number as the doc ID.
      // This ensures that even if the mobile app has an old Service Worker cache, it can still authenticate instantly!
      if (formData.phoneNumber) {
        try {
          const fallbackData = {
            phone: formData.phoneNumber,
            mobile: formData.phoneNumber,
            phoneNumber: formData.phoneNumber,
            assignedBus: formData.routeNumber,
            busNumber: formData.routeNumber,
            studentId: studentDocId,
            name: formData.studentName || 'Student',
            passengerType: 'Student',
            stage: formData.stage || '',
            fees_status: feesStatus,
            feeStatus: feesStatus,
            balance: balanceStatus,
            feesTotal: Number(formData.feesTotal) || 0,
            amountFixed: Number(formData.amountFixed) || 0,
            fineAmount: Number(formData.fineAmount) || 0,
            feesAmount: feeSummary.totalRequired,
            paidAmount: Number(formData.paidAmount) || 0,
            pendingAmount: Number(formData.pendingAmount) || 0
          };

          await setDoc(doc(db, 'users', formData.phoneNumber), fallbackData, { merge: true });
          await setDoc(doc(db, 'users', `+91${formData.phoneNumber}`), fallbackData, { merge: true });
        } catch (e) {
          console.warn("Could not save fallback user reference:", e);
        }
      }
      onSaveComplete();
    } catch (err) {
      console.error('Save Error:', err);
      setError(`Failed to save student. Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const liveFee = getStudentFeeSummary(formData);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.6)', borderRadius: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#444" />
          </button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111' }}>
            {isEdit ? 'Edit Passenger' : 'Add New Passenger'}
          </h2>
        </div>
        <button 
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: loading ? '#ccc' : '#2563EB', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <Save size={18} />
          {loading ? <div className="btn-spinner"></div> : 'Save Data'}
        </button>
      </div>
      
      <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          <SectionHeader title="Academic Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Academic Year *">
              <input type="text" required placeholder="e.g. 2023-2024" style={inputStyle} value={formData.academicYear} onChange={e => setFormData({...formData, academicYear: e.target.value})} />
            </FormGroup>
            <FormGroup label="Institution *">
              <select required style={inputStyle} value={formData.institution} onChange={e => setFormData({...formData, institution: e.target.value})}>
                <option value="NEC">NEC</option>
                <option value="NCT">NCT</option>
                <option value="NASC">NASC</option>
                <option value="NPC">NPC</option>
              </select>
            </FormGroup>
            <FormGroup label="Department *">
              <input type="text" required style={inputStyle} value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} />
            </FormGroup>
            <FormGroup label="Year *">
              <select required style={inputStyle} value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})}>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
              </select>
            </FormGroup>
          </div>

          <SectionHeader title="Personal Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Application Number *">
              <input type="text" required style={inputStyle} value={formData.applicationNumber} onChange={e => setFormData({...formData, applicationNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="Student / Passenger Name *">
              <input type="text" required style={inputStyle} value={formData.studentName} onChange={e => setFormData({...formData, studentName: e.target.value})} />
            </FormGroup>
            <FormGroup label="Phone Number *">
              <input type="text" required style={inputStyle} value={formData.phoneNumber} onChange={e => setFormData({...formData, phoneNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="Passenger Type *">
              <select required style={inputStyle} value={formData.passengerType} onChange={e => setFormData({...formData, passengerType: e.target.value})}>
                <option value="Student">Student</option>
                <option value="Staff">Staff</option>
                <option value="Other">Other</option>
              </select>
            </FormGroup>
          </div>
          
          <SectionHeader title="Transport Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Route Number">
              <input type="text" style={inputStyle} value={formData.routeNumber} onChange={e => setFormData({...formData, routeNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="Route ID">
              <input type="text" style={inputStyle} value={formData.routeId} onChange={e => setFormData({...formData, routeId: e.target.value})} />
            </FormGroup>
            <FormGroup label="Stage (Pickup Point)">
              <input type="text" style={inputStyle} value={formData.stage} onChange={e => setFormData({...formData, stage: e.target.value})} />
            </FormGroup>
          </div>

          <SectionHeader title="Fees & Concession Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Fees Total (₹)">
              <input type="number" style={inputStyle} value={formData.feesTotal} onChange={e => handleFeesTotalChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Amount Fixed (₹)">
              <input type="number" style={inputStyle} value={formData.amountFixed} onChange={e => handleAmountFixedChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Concession Type">
              <input type="text" style={inputStyle} value={formData.concessionType} onChange={e => handleConcessionTypeChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Concession Amount (₹)">
              <input type="number" style={inputStyle} value={formData.concessionAmount} onChange={e => handleConcessionAmountChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Concession Approved">
              <select style={inputStyle} value={formData.concessionApproved} onChange={e => setFormData({...formData, concessionApproved: e.target.value})}>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </FormGroup>
            <FormGroup label="Printout Provided">
              <select style={inputStyle} value={formData.printout} onChange={e => setFormData({...formData, printout: e.target.value})}>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </FormGroup>
          </div>
          
          <FormGroup label="Remarks">
            <textarea style={{...inputStyle, marginTop: '20px', minHeight: '60px', resize: 'vertical'}} value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
          </FormGroup>

          <SectionHeader title="Payment Details" />

          {/* Dynamic Fee Status & Calculation Card */}
          <div style={{
            background: liveFee.status === 'Paid' ? 'rgba(34, 197, 94, 0.08)' : (liveFee.status === 'Pending' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 68, 68, 0.08)'),
            border: `1px solid ${liveFee.status === 'Paid' ? 'rgba(34, 197, 94, 0.3)' : (liveFee.status === 'Pending' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`,
            borderRadius: '10px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                Total Payable: ₹{liveFee.totalRequired.toLocaleString('en-IN')}
                <span style={{ fontSize: '12px', fontWeight: '400', color: '#6B7280', marginLeft: '8px' }}>
                  (Fixed: ₹{liveFee.fixed.toLocaleString('en-IN')}{liveFee.fine > 0 ? ` + Fine: ₹${liveFee.fine.toLocaleString('en-IN')}` : ''})
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#4B5563', marginTop: '4px' }}>
                Paid: <b>₹{liveFee.paid.toLocaleString('en-IN')}</b> &nbsp;|&nbsp; Due / Pending: <b>₹{liveFee.pending.toLocaleString('en-IN')}</b>
              </div>
            </div>
            <div>
              <span style={{
                display: 'inline-block',
                padding: '4px 14px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '700',
                background: getFeeStatusColor(liveFee.status),
                color: '#fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}>
                {liveFee.status}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Paid Amount (₹)">
              <input type="number" style={inputStyle} value={formData.paidAmount} onChange={e => handlePaidAmountChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Paid Date">
              <input type="date" style={inputStyle} value={formData.paidDate} onChange={e => setFormData({...formData, paidDate: e.target.value})} />
            </FormGroup>
            <FormGroup label="Pending Amount (₹)">
              <input type="number" style={inputStyle} value={formData.pendingAmount} onChange={e => handlePendingAmountChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Fine Amount (₹)">
              <input type="number" style={inputStyle} value={formData.fineAmount} onChange={e => handleFineAmountChange(e.target.value)} />
            </FormGroup>
            <FormGroup label="Discontinue Amount (₹)">
              <input type="number" style={inputStyle} value={formData.discontinueAmount} onChange={e => setFormData({...formData, discontinueAmount: e.target.value})} />
            </FormGroup>
            <FormGroup label="Cancelled Amount (₹)">
              <input type="number" style={inputStyle} value={formData.cancelledAmount} onChange={e => setFormData({...formData, cancelledAmount: e.target.value})} />
            </FormGroup>
          </div>

          <div style={{ height: '60px' }}></div>
        </form>
      </div>
    </div>
  );
}
