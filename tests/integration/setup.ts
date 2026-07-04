// Environment for real-database integration tests. Must run before any test
// module imports '@/lib/prisma' (the Prisma client reads DATABASE_URL at
// module load). External values win via ||=.
process.env.DATABASE_URL ||= 'postgresql://umami:umami@localhost:54329/umami';
process.env.APP_SECRET ||= 'integration-test-secret';
process.env.JOBS_KEY ||= 'integration-jobs-key';

// Deterministic behavior regardless of the developer's shell environment.
delete process.env.ANTHROPIC_API_KEY; // AI endpoints must 404 (env-gated)
delete process.env.REDIS_URL; // no cache: api-key revocation is immediate
delete process.env.CLICKHOUSE_URL; // Postgres-first fork
delete process.env.CLOUD_MODE;
delete process.env.DISABLE_BOT_CHECK; // agent capture must be active
delete process.env.AGENT_TRACKING;
delete process.env.IGNORE_IP;
delete process.env.CLIENT_IP_HEADER;
delete process.env.REMOVE_TRAILING_SLASH;

// The GeoLite2 database (geo/GeoLite2-City.mmdb) is downloaded at build time
// and absent in this checkout; getLocation() would throw ENOENT for any
// public IP and turn /api/send into a 500. Pre-seeding the module-level
// reader cache (see src/lib/detect.ts) makes lookups resolve to "no match".
(globalThis as Record<string, any>).maxmind = { get: () => null };
