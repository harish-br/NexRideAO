/**
 * public/firebase-messaging-sw.js
 * Default Firebase Messaging Service Worker entrypoint.
 * Imports the unified NexRide Service Worker so both offline caching and
 * FCM background push work without code duplication.
 */

importScripts('/sw.js');
