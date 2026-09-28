import React, { useState } from 'react';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

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
    feesTotal: student?.feesTotal || '',
    concessionType: student?.concessionType || '',
    concessionAmount: student?.concessionAmount || '',
    concessionApproved: student?.concessionApproved || 'No',
    amountFixed: student?.amountFixed || '',
    printout: student?.printout || 'No',
    remark: student?.remark || '',
    
    // Payment Tracking
    paidAmount: student?.paidAmount || '',
    paidDate: student?.paidDate || '',
    pendingAmount: student?.pendingAmount || '',
    fineAmount: student?.fineAmount || '',
    discontinueAmount: student?.discontinueAmount || '',
    cancelledAmount: student?.cancelledAmount || ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const feesStatus = Number(formData.pendingAmount) === 0 && Number(formData.paidAmount) > 0 ? 'Paid' : 'Pending';
      const balanceStatus = Number(formData.pendingAmount) === 0 && Number(formData.paidAmount) > 0 ? 'Fully Paid' : 'Unpaid';

      const studentData = {
        ...formData,
        feesTotal: Number(formData.feesTotal) || 0,
        concessionAmount: Number(formData.concessionAmount) || 0,
        amountFixed: Number(formData.amountFixed) || 0,
        paidAmount: Number(formData.paidAmount) || 0,
        pendingAmount: Number(formData.pendingAmount) || 0,
        fineAmount: Number(formData.fineAmount) || 0,
        discontinueAmount: Number(formData.discontinueAmount) || 0,
        cancelledAmount: Number(formData.cancelledAmount) || 0,
        busNumber: formData.routeNumber, // Ensures mobile app detects bus assignment
        assignedBus: formData.routeNumber,
        phone: formData.phoneNumber, // Explicit mapping for user app
        mobile: formData.phoneNumber, // Explicit mapping for user app
        fees_status: feesStatus,
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
            balance: balanceStatus,
            feesTotal: Number(formData.feesTotal) || 0,
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
          {loading ? 'Saving...' : 'Save Data'}
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
                <option value="NECT">NECT</option>
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
              <input type="number" style={inputStyle} value={formData.feesTotal} onChange={e => setFormData({...formData, feesTotal: e.target.value})} />
            </FormGroup>
            <FormGroup label="Amount Fixed (₹)">
              <input type="number" style={inputStyle} value={formData.amountFixed} onChange={e => setFormData({...formData, amountFixed: e.target.value})} />
            </FormGroup>
            <FormGroup label="Concession Type">
              <input type="text" style={inputStyle} value={formData.concessionType} onChange={e => setFormData({...formData, concessionType: e.target.value})} />
            </FormGroup>
            <FormGroup label="Concession Amount (₹)">
              <input type="number" style={inputStyle} value={formData.concessionAmount} onChange={e => setFormData({...formData, concessionAmount: e.target.value})} />
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Paid Amount (₹)">
              <input type="number" style={inputStyle} value={formData.paidAmount} onChange={e => setFormData({...formData, paidAmount: e.target.value})} />
            </FormGroup>
            <FormGroup label="Paid Date">
              <input type="date" style={inputStyle} value={formData.paidDate} onChange={e => setFormData({...formData, paidDate: e.target.value})} />
            </FormGroup>
            <FormGroup label="Pending Amount (₹)">
              <input type="number" style={inputStyle} value={formData.pendingAmount} onChange={e => setFormData({...formData, pendingAmount: e.target.value})} />
            </FormGroup>
            <FormGroup label="Fine Amount (₹)">
              <input type="number" style={inputStyle} value={formData.fineAmount} onChange={e => setFormData({...formData, fineAmount: e.target.value})} />
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
