import * as Sentry from "@sentry/browser";

const dsn = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SENTRY_DSN)
  || "https://87925afcbb8bcf8e62a135e3703d83dd@o4512074146578432.ingest.de.sentry.io/4512074152935504";

Sentry.init({
  dsn,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Set tracesSampleRate to 1.0 to capture 100%
  // of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,

  // Set `tracePropagationTargets` to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: [
    "localhost",
    /^https:\/\/yourserver\.io\/api/,
    /^https:\/\/.*\.firebaseapp\.com/,
    /^https:\/\/.*\.web\.app/
  ],

  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

export * from "@sentry/browser";
export default Sentry;
