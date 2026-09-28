import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export default function Dashboard() {
  const [fleetData, setFleetData] = useState([]);
  const [driverData, setDriverData] = useState([]);
  const [docData, setDocData] = useState([]);
  const [vehicleDocData, setVehicleDocData] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen to buses
    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      const buses = snapshot.docs.map(doc => doc.data());
      setFleetData(buses);
      
      // Calculate vehicle docs from buses
      const vDocs = [];
      buses.forEach(bus => {
        if (bus.documents) {
          ['rc', 'fitness', 'insurance', 'pollution'].forEach(type => {
            if (bus.documents[type] && bus.documents[type].expiryDate) {
              const expiry = new Date(bus.documents[type].expiryDate);
              const today = new Date();
              const warning = new Date();
              warning.setDate(today.getDate() + 30);
              
              if (expiry < today) {
                vDocs.push({ status: 'expired' });
              } else if (expiry <= warning) {
                vDocs.push({ status: 'expire_1_month' });
              } else {
                vDocs.push({ status: 'valid' });
              }
            } else {
              vDocs.push({ status: 'inactive' });
            }
          });
        }
      });
      setVehicleDocData(vDocs);
    });

    // Listen to drivers
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      const drivers = snapshot.docs.map(doc => doc.data());
      setDriverData(drivers);
      
      // Calculate driver docs (license)
      const dDocs = [];
      drivers.forEach(driver => {
        if (driver.licenseExpiry) {
          const expiry = new Date(driver.licenseExpiry);
          const today = new Date();
          const warning = new Date();
          warning.setDate(today.getDate() + 30);
          
          if (expiry < today) {
            dDocs.push({ status: 'expired' });
          } else if (expiry <= warning) {
            dDocs.push({ status: 'expire_1_month' });
          } else {
            dDocs.push({ status: 'valid' });
          }
        }
      });
      setDocData(dDocs);
    });

    // Listen to reports
    const unsubReports = onSnapshot(collection(db, 'reports'), (snapshot) => {
      const reports = snapshot.docs.map(doc => doc.data());
      setReportData(reports);
    });
    
    // Simulate initial loading sequence for smooth animation
    const loadTimer = setTimeout(() => {
      setLoading(false);
    }, 400);

    return () => {
      unsubBuses();
      unsubDrivers();
      unsubReports();
      clearTimeout(loadTimer);
    };
  }, []);

  const fleetCounts = { active: 0, halted: 0, maintenance: 0, breakdown: 0, spare: 0 };
  fleetData.forEach(bus => {
    let status = bus.status?.toLowerCase() || 'active';
    if (fleetCounts.hasOwnProperty(status)) {
      fleetCounts[status]++;
    }
  });

  const driverCounts = { total: 0, acting: 0, onduty: 0, leave: 0 };
  driverData.forEach(driver => {
    let status = driver.status?.toLowerCase().replace(/\s+/g, '');
    if (status === 'active') status = 'onduty';
    if (status === 'onleave') status = 'leave';
    if (status === 'inactive') status = 'acting';
    
    if (driverCounts.hasOwnProperty(status)) {
      driverCounts[status]++;
    }
    driverCounts.total++;
  });

  const docCounts = { total: 0, expire_1_month: 0, expired: 0, acting: 0 };
  docData.forEach(doc => {
    const status = doc.status?.toLowerCase();
    if (docCounts.hasOwnProperty(status)) {
      docCounts[status]++;
    }
    docCounts.total++;
  });

  const vehicleDocCounts = { total: 0, expire_1_month: 0, expired: 0, inactive: 0 };
  vehicleDocData.forEach(doc => {
    const status = doc.status?.toLowerCase();
    if (vehicleDocCounts.hasOwnProperty(status)) {
      vehicleDocCounts[status]++;
    }
    vehicleDocCounts.total++;
  });

  const reportCounts = { total: 0, submitted: 0, inprogress: 0, resolved: 0 };
  reportData.forEach(report => {
    let status = report.status?.toLowerCase().replace(/\s+/g, '') || 'submitted';
    if (reportCounts.hasOwnProperty(status)) {
      reportCounts[status]++;
    }
    reportCounts.total++;
  });

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header">
        <h1>Dashboard</h1>
      </div>
      
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, padding: '4px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="skeleton" style={{ flex: 1, height: '140px', borderRadius: '16px' }}></div>
            <div className="skeleton" style={{ flex: 1, height: '140px', borderRadius: '16px' }}></div>
          </div>
          <div className="skeleton" style={{ width: '150px', height: '24px', borderRadius: '4px', marginTop: '16px', marginBottom: '8px' }}></div>
          <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
          <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
          <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, padding: '4px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div className="animate-fade-in-up" style={{ animationDelay: '0.05s', flex: 1, height: '140px', borderRadius: '16px', backgroundColor: 'rgba(0, 0, 0, 0.04)', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', alignContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#2563EB' }}>{fleetCounts.active}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>ACTIVE BUSES</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#D97706' }}>{fleetCounts.halted}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>HALTED</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#EA580C' }}>{fleetCounts.maintenance}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>MAINTENANCE</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#DC2626' }}>{fleetCounts.breakdown}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>BREAKDOWN</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#64748B' }}>{fleetCounts.spare}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>SPARE</span>
              </div>
            </div>
            <div className="animate-fade-in-up" style={{ animationDelay: '0.1s', flex: 1, height: '140px', borderRadius: '16px', backgroundColor: 'rgba(0, 0, 0, 0.04)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#2563EB' }}>{driverCounts.total}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>TOTAL DRIVERS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#0F766E' }}>{driverCounts.acting}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>ACTING</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#16A34A' }}>{driverCounts.onduty}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>ON DUTY</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: '700', color: '#64748B' }}>{driverCounts.leave}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>LEAVE</span>
              </div>
            </div>
          </div>
          
          <h2 className="animate-fade-in-up" style={{ animationDelay: '0.15s', fontSize: '18px', fontWeight: '600', color: '#222', marginTop: '16px', marginBottom: '8px' }}>Documents</h2>
          
          <div className="animate-fade-in-up" style={{ animationDelay: '0.2s', width: '100%', minHeight: '80px', borderRadius: '12px', backgroundColor: 'rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', padding: '12px 16px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#444', marginBottom: '8px' }}>Driver Documents</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#2563EB' }}>{docCounts.total}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>TOTAL DOCS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#D97706' }}>{docCounts.expire_1_month}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', textAlign: 'center' }}>EXPIRE IN 1 MONTH</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#DC2626' }}>{docCounts.expired}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>EXPIRED</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#0F766E' }}>{docCounts.acting}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>ACTING DOCS</span>
              </div>
            </div>
          </div>
          
          <div className="animate-fade-in-up" style={{ animationDelay: '0.25s', width: '100%', minHeight: '80px', borderRadius: '12px', backgroundColor: 'rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', padding: '12px 16px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#444', marginBottom: '8px' }}>Vehicle Documents</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#2563EB' }}>{vehicleDocCounts.total}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>TOTAL DOCS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#D97706' }}>{vehicleDocCounts.expire_1_month}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px', textAlign: 'center' }}>EXPIRE IN 1 MONTH</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#DC2626' }}>{vehicleDocCounts.expired}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>EXPIRED</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#64748B' }}>{vehicleDocCounts.inactive}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>INACTIVE DOCS</span>
              </div>
            </div>
          </div>
          
          <div className="animate-fade-in-up" style={{ animationDelay: '0.3s', width: '100%', minHeight: '80px', borderRadius: '12px', backgroundColor: 'rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', padding: '12px 16px', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#444', marginBottom: '8px' }}>Reports</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignContent: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#2563EB' }}>{reportCounts.total}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>TOTAL REPORTS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#D97706' }}>{reportCounts.submitted}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>SUBMITTED</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#EA580C' }}>{reportCounts.inprogress}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>IN PROGRESS</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: '700', color: '#16A34A' }}>{reportCounts.resolved}</span>
                <span style={{ fontSize: '9px', fontWeight: '600', color: '#6B7280', letterSpacing: '0.5px' }}>RESOLVED</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
