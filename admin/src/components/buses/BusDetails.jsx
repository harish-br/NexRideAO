import React, { useState } from 'react';
import { ArrowLeft, Edit2, ShieldAlert, FileText, Download, CheckCircle, Clock, AlertTriangle, AlertCircle } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function BusDetails({ bus, onBack, onEdit, onStatusChange }) {
  const [loading, setLoading] = useState(false);

  const handleDeactivate = async () => {
    if (!window.confirm(`Are you sure you want to deactivate bus ${bus.busNumber}?`)) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'buses', bus.id), { status: 'Halted', updatedAt: new Date().toISOString() });
      onStatusChange();
    } catch (err) {
      console.error(err);
      alert('Failed to deactivate bus.');
    } finally {
      setLoading(false);
    }
  };

  const getDocStatus = (docData) => {
    if (!docData || !docData.expiryDate) return { text: 'Missing', color: '#DC2626', icon: <AlertCircle size={16} /> };
    const expiry = new Date(docData.expiryDate);
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 30);
    
    if (expiry < today) {
      return { text: 'Expired', color: '#DC2626', icon: <AlertCircle size={16} /> };
    } else if (expiry <= warningDate) {
      return { text: 'Expiring Soon', color: '#D97706', icon: <AlertTriangle size={16} /> };
    }
    return { text: 'Valid', color: '#16A34A', icon: <CheckCircle size={16} /> };
  };

  const DataGroup = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '15px', fontWeight: '500', color: '#111' }}>{value || '-'}</span>
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ padding: '24px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111', margin: '0 0 20px 0' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        {children}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.7)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.8)', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#444" />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {bus.busNumber || '-'}
              <span style={{ fontSize: '12px', background: '#F3F4F6', padding: '4px 8px', borderRadius: '4px', color: '#374151' }}>{bus.registrationNumber || bus.regNumber || '-'}</span>
            </h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => onEdit(bus)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', color: '#111', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            <Edit2 size={16} /> Edit
          </button>
          <button onClick={handleDeactivate} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEE2E2', color: '#DC2626', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
            <ShieldAlert size={16} /> {loading ? <div className="btn-spinner" style={{borderColor: 'rgba(220, 38, 38, 0.3)', borderTopColor: '#DC2626'}}></div> : 'Deactivate'}
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <Section title="Bus Information">
          <DataGroup label="Manufacturer" value={bus.manufacturer || '-'} />
          <DataGroup label="Model" value={bus.model || '-'} />
          <DataGroup label="Bus Type" value={bus.busType || '-'} />
          <DataGroup label="Bharat Stage" value={bus.bharatStage || '-'} />
          <DataGroup label="Manufacturing Year" value={bus.manufacturingYear || '-'} />
          <DataGroup label="Seat Capacity" value={`${bus.capacity || bus.seatCapacity || bus.totalCapacity || '-'} Seats`} />
          <DataGroup label="Standing Capacity" value={`${bus.standingCapacity || 0} Standing`} />
          <DataGroup label="Current Status" value={bus.status || 'Active'} />
        </Section>

        <Section title="Route & Driver">
          <DataGroup label="Assigned Route" value={bus.assignedRouteName || bus.routeName || bus.route || 'Unassigned'} />
          <DataGroup label="Route Coverage" value={bus.coverageType === 'specific_segment' ? 'Specific Segment' : 'Full Route'} />
          {bus.coverageType === 'specific_segment' && (
             <DataGroup label="Segment" value={`${bus.startPoint || 'N/A'} ➔ ${bus.endPoint || 'N/A'}`} />
          )}
          <DataGroup label="Assigned Driver" value={bus.assignedDriverName || bus.driverName || 'Unassigned'} />
          <DataGroup label="Driver Contact" value={bus.driverContact || '-'} />
          <DataGroup label="Driver License" value={bus.driverLicense || '-'} />
        </Section>

        <Section title="Operating Timings">
          <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Morning Shift</div>
            <div style={{ display: 'flex', gap: '24px' }}>
              <DataGroup label="Departure" value={bus.operatingTimings?.morning?.departure || bus.schedules?.morningDeparture || bus.morningDeparture || '-'} />
              <DataGroup label="Arrival" value={bus.operatingTimings?.morning?.arrival || bus.schedules?.morningArrival || bus.morningArrival || '-'} />
            </div>
          </div>
          <div style={{ background: '#F8F9FA', padding: '16px', borderRadius: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Evening Shift</div>
            <div style={{ display: 'flex', gap: '24px' }}>
              <DataGroup label="Departure" value={bus.operatingTimings?.evening?.departure || bus.schedules?.eveningDeparture || bus.eveningDeparture || '-'} />
              <DataGroup label="Arrival" value={bus.operatingTimings?.evening?.arrival || bus.schedules?.eveningArrival || bus.eveningArrival || '-'} />
            </div>
          </div>
        </Section>

        {bus.stops && bus.stops.length > 0 && (
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111', margin: '0 0 20px 0' }}>Route Stops</h3>
            <div style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 100px', padding: '12px 16px', background: '#F8F9FA', borderBottom: '1px solid rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase' }}>
                <div>Order</div>
                <div>Stop Name</div>
                <div>Morning</div>
                <div>Evening</div>
              </div>
              {bus.stops.sort((a, b) => (a.order || a.stopOrder || 0) - (b.order || b.stopOrder || 0)).map((stop, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 100px 100px', padding: '12px 16px', borderBottom: i === bus.stops.length - 1 ? 'none' : '1px solid rgba(0,0,0,0.05)', fontSize: '14px', alignItems: 'center' }}>
                  <div style={{ fontWeight: '600', color: '#2563EB' }}>#{stop.order || stop.stopOrder || i + 1}</div>
                  <div style={{ fontWeight: '500' }}>{stop.name || stop.stopName || '-'}</div>
                  <div style={{ color: '#444' }}>{stop.morningArrival || stop.arrivalTime || '-'}</div>
                  <div style={{ color: '#444' }}>{stop.eveningArrival || stop.departureTime || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Section title="Maintenance">
          <DataGroup label="Last Service Date" value={bus.maintenance?.lastServiceDate || '-'} />
          <DataGroup label="Next Service Date" value={bus.maintenance?.nextServiceDate || '-'} />
          <div style={{ gridColumn: '1 / -1' }}>
             <DataGroup label="Notes" value={bus.maintenance?.notes || '-'} />
          </div>
        </Section>

        <div style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#111', margin: '0 0 20px 0' }}>Vehicle Documents</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {['rc', 'fitness', 'insurance', 'pollution'].map(type => {
              const docInfo = bus.documents?.[type];
              const status = getDocStatus(docInfo);
              
              return (
                <div key={type} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={20} color="#6B7280" />
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#111', textTransform: 'uppercase' }}>{type}</span>
                    </div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', color: status.color, background: `${status.color}15`, padding: '4px 8px', borderRadius: '100px' }}>
                      {status.icon} {status.text}
                    </span>
                  </div>
                  
                  {docInfo ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <DataGroup label="Expiry Date" value={docInfo.expiryDate} />
                      
                      {docInfo.fileUrl && (
                        <a href={docInfo.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563EB', fontSize: '13px', fontWeight: '500', textDecoration: 'none', marginTop: '4px' }}>
                          <Download size={14} /> View Document
                        </a>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#6B7280' }}>No document uploaded</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        <div style={{ height: '40px' }} />
      </div>
    </div>
  );
}
