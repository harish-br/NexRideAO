/**
 * Utility functions for bus deduplication and key normalization across the admin panel.
 */

export function getBusKey(bus) {
  if (!bus) return '';
  const num = String(bus.busNumber || '').trim().replace(/^bus[_\s-]*/i, '').trim();
  const idNum = String(bus.id || '').trim().replace(/^bus[_\s-]*/i, '').trim();
  const key = num || idNum || String(bus.id || '').trim();
  return key.toLowerCase();
}

export function deduplicateBuses(rawList) {
  if (!Array.isArray(rawList)) return [];
  const map = new Map();

  for (const item of rawList) {
    if (!item) continue;
    const key = getBusKey(item);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const prev = map.get(key);

      // Score completeness to decide which record is the primary metadata record
      const scorePrev =
        (prev.assignedRouteName || prev.routeName ? 4 : 0) +
        (prev.assignedDriverName || prev.driverName ? 4 : 0) +
        (prev.schedules || prev.operatingTimings ? 2 : 0) +
        (prev.registrationNumber || prev.regNumber ? 1 : 0) +
        (String(prev.id || '').startsWith('bus_') ? 1 : 0);

      const scoreItem =
        (item.assignedRouteName || item.routeName ? 4 : 0) +
        (item.assignedDriverName || item.driverName ? 4 : 0) +
        (item.schedules || item.operatingTimings ? 2 : 0) +
        (item.registrationNumber || item.regNumber ? 1 : 0) +
        (String(item.id || '').startsWith('bus_') ? 1 : 0);

      const primary = scoreItem >= scorePrev ? item : prev;
      const secondary = scoreItem >= scorePrev ? prev : item;

      // Merge: retain richest metadata while preserving live status and telematics
      const merged = {
        ...secondary,
        ...primary,
        assignedRouteName: primary.assignedRouteName || secondary.assignedRouteName || primary.routeName || secondary.routeName,
        routeName: primary.routeName || secondary.routeName || primary.assignedRouteName || secondary.assignedRouteName,
        assignedDriverName: primary.assignedDriverName || secondary.assignedDriverName || primary.driverName || secondary.driverName,
        driverName: primary.driverName || secondary.driverName || primary.assignedDriverName || secondary.assignedDriverName,
        schedules: primary.schedules || secondary.schedules,
        operatingTimings: primary.operatingTimings || secondary.operatingTimings,
        registrationNumber: primary.registrationNumber || secondary.registrationNumber || primary.regNumber || secondary.regNumber,
        regNumber: primary.regNumber || secondary.regNumber || primary.registrationNumber || secondary.registrationNumber,
        status: (primary.status && primary.status !== 'Offline' ? primary.status : secondary.status) || primary.status || 'Offline',
        lat: primary.lat ?? secondary.lat,
        lng: primary.lng ?? secondary.lng,
        latitude: primary.latitude ?? secondary.latitude,
        longitude: primary.longitude ?? secondary.longitude,
        speed: primary.speed ?? secondary.speed,
        id: String(primary.id || '').startsWith('bus_') ? primary.id : (String(secondary.id || '').startsWith('bus_') ? secondary.id : primary.id),
        busNumber: primary.busNumber || secondary.busNumber || key,
      };

      map.set(key, merged);
    }
  }

  return Array.from(map.values());
}

/**
 * Returns dynamic route name based on morning (12:00 AM - 12:00 PM) vs evening (12:00 PM - 12:00 AM)
 * Morning: Origin → Nandha Engg (e.g. Komarayanur → Nandha Engg)
 * Evening: Nandha Engg → Origin (e.g. Nandha Engg → Komarayanur)
 */
export function getDynamicRouteName(bus, isMorning = (new Date().getHours() < 12)) {
  const baseRoute = bus?.assignedRouteName || bus?.routeName || bus?.route || '';
  const collegeName = 'Nandha Engg';

  // Explicit override if configured
  if (isMorning && (bus?.morningRouteName || bus?.morningRoute)) {
    return bus.morningRouteName || bus.morningRoute;
  }
  if (!isMorning && (bus?.eveningRouteName || bus?.eveningRoute)) {
    return bus.eveningRouteName || bus.eveningRoute;
  }

  // Check if baseRoute has a directional delimiter (→, ➔, ->, --, to)
  const delimiterMatch = baseRoute.match(/\s*(?:→|➔|->|--|\bto\b)\s*/i);
  if (delimiterMatch) {
    const parts = baseRoute.split(delimiterMatch[0]).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const from = parts[0];
      const to = parts[1];
      return isMorning ? `${from} → ${to}` : `${to} → ${from}`;
    }
  }

  const startPoint = bus?.startPoint || bus?.origin || baseRoute || '';
  const destination = bus?.destination || bus?.endPoint || collegeName;

  if (startPoint && destination && startPoint.toLowerCase() !== destination.toLowerCase()) {
    if (/nandha/i.test(startPoint) && !/nandha/i.test(destination)) {
      return isMorning ? `${destination} → ${startPoint}` : `${startPoint} → ${destination}`;
    }
    return isMorning ? `${startPoint} → ${destination}` : `${destination} → ${startPoint}`;
  }

  if (baseRoute) {
    if (!/nandha/i.test(baseRoute)) {
      return isMorning ? `${baseRoute} → ${collegeName}` : `${collegeName} → ${baseRoute}`;
    }
    return baseRoute;
  }

  return isMorning ? `Origin → ${collegeName}` : `${collegeName} → Origin`;
}
