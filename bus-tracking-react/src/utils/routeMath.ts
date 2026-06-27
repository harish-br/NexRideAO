export interface Stop {
  name: string;
  lat: number;
  lng: number;
  scheduledArrival: string; // HH:mm format
}

export const ROUTE_STOPS: Stop[] = [
  { name: "Guruvareddiyur", lat: 11.6452378, lng: 77.6818465, scheduledArrival: "06:40" },
  { name: "Kuttaimuniyappan Kovil", lat: 11.5232544, lng: 77.7051012, scheduledArrival: "07:45" },
  { name: "Rana Nagar", lat: 11.4572704, lng: 77.6909143, scheduledArrival: "07:55" },
  { name: "Palani Aandavar Temple", lat: 11.4429531, lng: 77.6832342, scheduledArrival: "08:00" },
  { name: "Nandha Engineering College", lat: 11.2842104, lng: 77.6196129, scheduledArrival: "08:05" }
];

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // meters
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Convert "HH:mm" to minutes since midnight for easy comparison
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function calculateDelay(scheduledTimeStr: string, actualTime: Date): number {
  const scheduledMinutes = timeToMinutes(scheduledTimeStr);
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  const delay = actualMinutes - scheduledMinutes;
  return delay > 0 ? delay : 0;
}

export function calculateETA(distanceMeters: number, speedKmph: number): number {
  if (speedKmph <= 0) return 0;
  // Time = distance / speed
  // Speed in meters per minute = (speedKmph * 1000) / 60
  const speedMpm = (speedKmph * 1000) / 60;
  return Math.ceil(distanceMeters / speedMpm);
}
