import React, { useState, useEffect } from 'react';
import { ArrowLeft, Edit2, ShieldAlert, FileText, Download, CheckCircle, Clock, AlertTriangle, AlertCircle, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

import windIcon from '../../assets/svg/wind.svg';
import briefcaseTickIcon from '../../assets/svg/brifecase-tick.svg';
import documentTextIcon from '../../assets/svg/document-text.svg';
import cardIcon from '../../assets/svg/card.svg';

export default function BusDetails({ bus, onBack, onEdit, onDelete, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [driverDetails, setDriverDetails] = useState(null);

  useEffect(() => {
    const fetchDriver = async () => {
      const driverId = bus.assignedDriverId || bus.driverId;
      if (driverId) {
        try {
          const driverSnap = await getDoc(doc(db, 'drivers', driverId));
          if (driverSnap.exists()) {
            setDriverDetails(driverSnap.data());
          }
        } catch (err) {
          console.error("Failed to fetch driver details", err);
        }
      }
    };
    fetchDriver();
  }, [bus.assignedDriverId, bus.driverId]);

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
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const warningDate = new Date(today);
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
              <span style={{ fontSize: '13px', background: '#ffd104', padding: '4px 10px', borderRadius: '6px', color: '#000000', border: '2px solid #000', fontWeight: '800', letterSpacing: '0.5px' }}>{bus.registrationNumber || bus.regNumber || '-'}</span>
            </h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => onEdit(bus)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', color: '#111', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M15.7999 2.21048C15.3899 1.80048 14.6799 2.08048 14.6799 2.65048V6.14048C14.6799 7.60048 15.9199 8.81048 17.4299 8.81048C18.3799 8.82048 19.6999 8.82048 20.8299 8.82048C21.3999 8.82048 21.6999 8.15048 21.2999 7.75048C19.8599 6.30048 17.2799 3.69048 15.7999 2.21048Z"/>
              <path d="M20.5 10.19H17.61C15.24 10.19 13.31 8.26 13.31 5.89V3C13.31 2.45 12.86 2 12.31 2H8.07C4.99 2 2.5 4 2.5 7.57V16.43C2.5 20 4.99 22 8.07 22H15.93C19.01 22 21.5 20 21.5 16.43V11.19C21.5 10.64 21.05 10.19 20.5 10.19ZM11.5 17.75H7.5C7.09 17.75 6.75 17.41 6.75 17C6.75 16.59 7.09 16.25 7.5 16.25H11.5C11.91 16.25 12.25 16.59 12.25 17C12.25 17.41 11.91 17.75 11.5 17.75ZM13.5 13.75H7.5C7.09 13.75 6.75 13.41 6.75 13C6.75 12.59 7.09 12.25 7.5 12.25H13.5C13.91 12.25 14.25 12.59 14.25 13C14.25 13.41 13.91 13.75 13.5 13.75Z"/>
            </svg> Edit
          </button>
          <button onClick={() => onDelete(bus)} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEE2E2', color: '#DC2626', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 5.98047C17.67 5.65047 14.32 5.48047 10.98 5.48047C9 5.48047 7.02 5.58047 5.04 5.78047L3 5.98047" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M8.5 4.97L8.72 3.66C8.88 2.71 9 2 10.69 2H13.31C15 2 15.13 2.75 15.28 3.67L15.5 4.97" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.85 9.14062L18.2 19.2106C18.09 20.7806 18 22.0006 15.21 22.0006H8.79002C6.00002 22.0006 5.91002 20.7806 5.80002 19.2106L5.15002 9.14062" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg> Delete
          </button>
          <button onClick={handleDeactivate} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFF7ED', color: '#EA580C', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.76 15.92L15.36 4.4C14.5 2.85 13.31 2 12 2C10.69 2 9.49998 2.85 8.63998 4.4L2.23998 15.92C1.42998 17.39 1.33998 18.8 1.98998 19.91C2.63998 21.02 3.91998 21.63 5.59998 21.63H18.4C20.08 21.63 21.36 21.02 22.01 19.91C22.66 18.8 22.57 17.38 21.76 15.92ZM11.25 9C11.25 8.59 11.59 8.25 12 8.25C12.41 8.25 12.75 8.59 12.75 9V14C12.75 14.41 12.41 14.75 12 14.75C11.59 14.75 11.25 14.41 11.25 14V9ZM12.71 17.71C12.66 17.75 12.61 17.79 12.56 17.83C12.5 17.87 12.44 17.9 12.38 17.92C12.32 17.95 12.26 17.97 12.19 17.98C12.13 17.99 12.06 18 12 18C11.94 18 11.87 17.99 11.8 17.98C11.74 17.97 11.68 17.95 11.62 17.92C11.56 17.9 11.5 17.87 11.44 17.83C11.39 17.79 11.34 17.75 11.29 17.71C11.11 17.52 11 17.26 11 17C11 16.74 11.11 16.48 11.29 16.29C11.34 16.25 11.39 16.21 11.44 16.17C11.5 16.13 11.56 16.1 11.62 16.08C11.68 16.05 11.74 16.03 11.8 16.02C11.93 15.99 12.07 15.99 12.19 16.02C12.26 16.03 12.32 16.05 12.38 16.08C12.44 16.1 12.5 16.13 12.56 16.17C12.61 16.21 12.66 16.25 12.71 16.29C12.89 16.48 13 16.74 13 17C13 17.26 12.89 17.52 12.71 17.71Z"/>
            </svg> {loading ? <div className="btn-spinner" style={{ borderColor: 'rgba(234, 88, 12, 0.3)', borderTopColor: '#EA580C' }}></div> : 'Deactivate'}
          </button>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        <Section title="Bus Information">
          <DataGroup label="Manufacturer" value={bus.manufacturer || '-'} />
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
          <DataGroup label="Assigned Driver" value={bus.assignedDriverName || bus.driverName || (driverDetails ? driverDetails.driverName : 'Unassigned')} />
          <DataGroup label="Driver Contact" value={driverDetails?.contactNumber || bus.driverContact || '-'} />
          <DataGroup label="Driver License" value={driverDetails?.licenseNumber || bus.driverLicense || '-'} />
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

              const getIconForType = (t) => {
                switch(t) {
                  case 'rc': return cardIcon;
                  case 'fitness': return documentTextIcon;
                  case 'insurance': return briefcaseTickIcon;
                  case 'pollution': return windIcon;
                  default: return cardIcon;
                }
              };

              return (
                <div key={type} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <img src={getIconForType(type)} alt={type} style={{ width: '20px', height: '20px', filter: 'brightness(0)' }} />
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
