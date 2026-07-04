/**
 * Hand-curated OpenAPI 3.1 description of the analytics API surface (RFD 0004).
 *
 * Schemas are written as JSON Schema literals, checked by hand against the zod
 * schemas in the route handlers and `src/lib/schema.ts`. When a route changes,
 * update the matching operation here.
 */

const FILTER_OPERATORS = [
  'eq',
  'neq',
  's',
  'ns',
  'c',
  'dnc',
  're',
  'nre',
  't',
  'f',
  'gt',
  'lt',
  'gte',
  'lte',
  'bf',
  'af',
];

const FILTER_FIELDS = [
  'path',
  'referrer',
  'title',
  'query',
  'os',
  'browser',
  'device',
  'country',
  'region',
  'city',
  'tag',
  'hostname',
  'distinctId',
  'language',
  'event',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmContent',
  'utmTerm',
];

const FILTER_CONVENTION = [
  `Filter values use an optional operator prefix: \`<operator>.<value>\`, e.g. \`path=eq./pricing\`, \`referrer=c.google\`, \`country=neq.US\`.`,
  `Operators: ${FILTER_OPERATORS.map(op => `\`${op}\``).join(', ')} (eq=equals, neq=not equals, s=set, ns=not set, c=contains, dnc=does not contain, re=regex, nre=not regex, t=true, f=false, gt/lt/gte/lte=comparisons, bf=before, af=after).`,
  'Without a prefix the operator defaults to `eq`. For `eq` and `neq` the value may be a comma-separated list.',
  'The same field can be filtered more than once by appending a numeric suffix (`path1=c.docs&path2=neq./docs/legacy`); `match=all|any` controls how multiple filters combine.',
].join(' ');

function filterQueryParameters(): Record<string, any>[] {
  return FILTER_FIELDS.map(name => ({
    name,
    in: 'query',
    required: false,
    description: `Filter by ${name}. ${name === 'path' ? FILTER_CONVENTION : 'Uses the operator-prefix filter convention (see the `path` parameter).'}`,
    schema: { type: 'string' },
  }));
}

function dateRangeQueryParameters(): Record<string, any>[] {
  return [
    {
      name: 'startAt',
      in: 'query',
      required: true,
      description: 'Start of the date range as a Unix timestamp in **milliseconds**.',
      schema: { type: 'integer', format: 'int64' },
    },
    {
      name: 'endAt',
      in: 'query',
      required: true,
      description: 'End of the date range as a Unix timestamp in **milliseconds**.',
      schema: { type: 'integer', format: 'int64' },
    },
    {
      name: 'unit',
      in: 'query',
      required: false,
      description:
        'Time bucket for series data. Must be valid for the range length; otherwise the minimum allowed unit is used.',
      schema: { type: 'string', enum: ['year', 'month', 'day', 'hour', 'minute'] },
    },
    {
      name: 'timezone',
      in: 'query',
      required: false,
      description: 'IANA timezone used for date bucketing, e.g. `America/New_York`.',
      schema: { type: 'string' },
    },
    {
      name: 'compare',
      in: 'query',
      required: false,
      description: 'Comparison period: previous period or same period a year earlier.',
      schema: { type: 'string', enum: ['prev', 'yoy'] },
    },
    {
      name: 'match',
      in: 'query',
      required: false,
      description: 'How multiple filters combine: `all` (AND, default) or `any` (OR).',
      schema: { type: 'string', enum: ['all', 'any'] },
    },
    {
      name: 'segment',
      in: 'query',
      required: false,
      description: 'Saved segment id whose filters are merged into the query.',
      schema: { type: 'string', format: 'uuid' },
    },
    {
      name: 'cohort',
      in: 'query',
      required: false,
      description: 'Saved cohort id whose filters are merged into the query.',
      schema: { type: 'string', format: 'uuid' },
    },
  ];
}

function pagingQueryParameters(): Record<string, any>[] {
  return [
    {
      name: 'page',
      in: 'query',
      required: false,
      description: 'Page number, starting at 1.',
      schema: { type: 'integer', minimum: 1 },
    },
    {
      name: 'pageSize',
      in: 'query',
      required: false,
      description: 'Number of rows per page.',
      schema: { type: 'integer', minimum: 1 },
    },
    {
      name: 'search',
      in: 'query',
      required: false,
      description: 'Free-text search.',
      schema: { type: 'string' },
    },
  ];
}

const websiteIdPathParameter = {
  name: 'websiteId',
  in: 'path',
  required: true,
  description: 'Website id (UUID).',
  schema: { type: 'string', format: 'uuid' },
};

const alertIdPathParameter = {
  name: 'alertId',
  in: 'path',
  required: true,
  description: 'Alert id (UUID).',
  schema: { type: 'string', format: 'uuid' },
};

/** Required `startAt`/`endAt` (ms) parameters for the agent-traffic endpoints. */
function agentDateQueryParameters(): Record<string, any>[] {
  return [
    {
      name: 'startAt',
      in: 'query',
      required: true,
      description: 'Start of the date range as a Unix timestamp in **milliseconds**.',
      schema: { type: 'integer', format: 'int64' },
    },
    {
      name: 'endAt',
      in: 'query',
      required: true,
      description: 'End of the date range as a Unix timestamp in **milliseconds**.',
      schema: { type: 'integer', format: 'int64' },
    },
  ];
}

const unauthorizedResponse = {
  description: 'Missing or invalid credentials, or no access to the website.',
};

const badRequestResponse = {
  description: 'Invalid query parameters or request body (zod validation error).',
};

function jsonResponse(description: string, schema: Record<string, any>): Record<string, any> {
  return {
    description,
    content: { 'application/json': { schema } },
  };
}

/**
 * Shared request-body schema for the `POST /api/reports/*` endpoints.
 * All of them validate against `reportResultSchema` in `src/lib/schema.ts`:
 * `{ websiteId, type, filters, parameters }` where `parameters` is
 * type-specific.
 */
function reportRequestBody(
  type: string,
  parametersSchema: Record<string, any>,
  description: string,
): Record<string, any> {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['websiteId', 'type', 'filters', 'parameters'],
          properties: {
            websiteId: { type: 'string', format: 'uuid' },
            type: { type: 'string', const: type },
            filters: {
              type: 'object',
              description: `Field filters applied to the report. Keys are filter field names (${FILTER_FIELDS.join(', ')}); values use the operator-prefix convention (\`eq./pricing\`, \`c.google\`, ...). Send \`{}\` for no filters.`,
              additionalProperties: { type: 'string' },
            },
            parameters: { ...parametersSchema, description },
          },
        },
      },
    },
  };
}

const dateParametersFragment = {
  startDate: {
    type: 'string',
    format: 'date-time',
    description: 'Start of the report window (ISO 8601).',
  },
  endDate: {
    type: 'string',
    format: 'date-time',
    description: 'End of the report window (ISO 8601).',
  },
};

const seriesPointSchema = {
  type: 'object',
  description: 'One time bucket of a series.',
  properties: {
    x: { type: 'string', description: 'Bucket start (date string for the requested unit).' },
    y: { type: 'number', description: 'Count for the bucket.' },
  },
};

const metricRowSchema = {
  type: 'object',
  description: 'One row of a metrics breakdown.',
  properties: {
    x: {
      type: ['string', 'null'],
      description: 'Metric value (e.g. a path, referrer domain, country code).',
    },
    y: { type: 'number', description: 'Count of visitors/events for the value.' },
  },
};

const websiteSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    domain: { type: 'string' },
    shareId: { type: ['string', 'null'] },
    resetAt: { type: ['string', 'null'], format: 'date-time' },
    userId: { type: ['string', 'null'], format: 'uuid' },
    teamId: { type: ['string', 'null'], format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: ['string', 'null'], format: 'date-time' },
    deletedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

const websiteStatsSchema = {
  type: 'object',
  description:
    'Aggregate metrics for the requested range. `comparison` holds the same fields for the comparison period (`compare=prev` by default).',
  properties: {
    pageviews: { type: 'number', description: 'Total pageview events.' },
    visitors: {
      type: 'number',
      description: 'Distinct salted session ids (see the metric semantics in the API description).',
    },
    visits: { type: 'number', description: 'Distinct visit ids (session activity windows).' },
    bounces: { type: 'number', description: 'Visits with a single pageview.' },
    totaltime: { type: 'number', description: 'Total time on site in seconds.' },
    comparison: {
      type: 'object',
      properties: {
        pageviews: { type: 'number' },
        visitors: { type: 'number' },
        visits: { type: 'number' },
        bounces: { type: 'number' },
        totaltime: { type: 'number' },
      },
    },
  },
};

const pagedResultSchema = {
  type: 'object',
  properties: {
    data: { type: 'array', items: { type: 'object' } },
    count: { type: 'number', description: 'Total number of rows across all pages.' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  },
};

const apiKeySchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    keyPrefix: {
      type: 'string',
      description: 'First characters of the key, for display. The full key is never stored.',
    },
    expiresAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const agentTrafficTotalsSchema = {
  type: 'object',
  description: 'Bot/agent event totals for one period.',
  properties: {
    events: { type: 'number', description: 'All classified bot/agent events.' },
    crawlers: { type: 'number', description: 'Events in the `ai_crawler` category.' },
    agents: { type: 'number', description: 'Events in the `ai_agent` category.' },
    search: { type: 'number', description: 'Events in the `ai_search` category.' },
    other: {
      type: 'number',
      description: 'Events in the remaining categories (search crawlers, SEO tools, ...).',
    },
    distinctClients: { type: 'number', description: 'Distinct hashed client IPs.' },
  },
};

const ALERT_TYPE_PARAMETERS = [
  'Per-type `parameters`:',
  '- `threshold` — `{ metric, operator: "gt"|"lt", value: number, windowMinutes: 1–10080 }`',
  '- `change` — `{ metric, windowMinutes: 1–10080, pctChange: number > 0, direction: "up"|"down"|"both" }`',
  '- `new-agent` and `digest` take no parameters (send `{}`).',
].join('\n');

const alertChannelSchema = {
  type: 'object',
  required: ['type', 'url'],
  properties: {
    type: { type: 'string', enum: ['slack', 'discord', 'webhook'] },
    url: {
      type: 'string',
      maxLength: 500,
      description:
        'Webhook URL. Must be a public http(s) address — private/internal hosts are rejected.',
    },
  },
};

const alertSchema = {
  type: 'object',
  description: `A configured alert (RFD 0008). ${ALERT_TYPE_PARAMETERS}`,
  properties: {
    id: { type: 'string', format: 'uuid' },
    websiteId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    type: { type: 'string', enum: ['threshold', 'change', 'new-agent', 'digest'] },
    parameters: { type: 'object', additionalProperties: true },
    channels: { type: 'array', items: alertChannelSchema },
    enabled: { type: 'boolean' },
    intervalMinutes: { type: 'integer' },
    nextRunAt: { type: ['string', 'null'], format: 'date-time' },
    lastTriggeredAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: ['string', 'null'], format: 'date-time' },
    updatedAt: { type: ['string', 'null'], format: 'date-time' },
  },
};

const alertEventSchema = {
  type: 'object',
  description: 'One evaluation outcome of an alert (triggered, ok or error).',
  properties: {
    id: { type: 'string', format: 'uuid' },
    alertId: { type: 'string', format: 'uuid' },
    websiteId: { type: 'string', format: 'uuid' },
    status: { type: 'string' },
    payload: { type: ['object', 'null'], additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

/**
 * Request body for `POST /api/alerts` (create — most fields required) and
 * `POST /api/alerts/{alertId}` (update — everything optional, `websiteId`
 * not accepted).
 */
function alertRequestBody(isCreate: boolean): Record<string, any> {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          description: ALERT_TYPE_PARAMETERS,
          ...(isCreate && { required: ['websiteId', 'name', 'type', 'channels'] }),
          properties: {
            ...(isCreate && { websiteId: { type: 'string', format: 'uuid' } }),
            name: { type: 'string', minLength: 1, maxLength: 200 },
            type: { type: 'string', enum: ['threshold', 'change', 'new-agent', 'digest'] },
            parameters: {
              type: 'object',
              additionalProperties: true,
              description: 'Type-specific parameters, validated per `type`. Defaults to `{}`.',
            },
            channels: {
              type: 'array',
              minItems: 1,
              items: alertChannelSchema,
            },
            enabled: { type: 'boolean', description: 'Defaults to `true`.' },
            intervalMinutes: {
              type: 'integer',
              minimum: 5,
              maximum: 10080,
              description: 'How often the alert is evaluated. Defaults to 60.',
            },
          },
        },
      },
    },
  };
}

export function getOpenApiSpec(): Record<string, any> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Umami Analytics API (agentic fork)',
      version: '1.0.0',
      description: [
        'HTTP API for querying Umami web analytics. All endpoints (except this spec) require authentication.',
        '',
        '## Metric semantics',
        '',
        '- **visitors** — count of distinct *salted session ids*. A session id is a hash of website id, IP and user agent combined with a rotating salt; the salt rotates per the `SALT_ROTATION` env var (`day` | `week` | `month`, default **monthly**), so visitor identity never persists past one rotation window.',
        '- **visits** — distinct 30-minute session activity windows: a visit expires after ~30 minutes of inactivity (without Redis, an hourly salt fallback bounds a visit to the clock hour).',
        '- **pageviews** — raw pageview events.',
        '- **bounces** — visits containing a single pageview.',
        '- **totaltime** — summed time on site in seconds.',
        '',
        '## Timestamps',
        '',
        'Date-range query parameters `startAt` and `endAt` are Unix epoch timestamps in **milliseconds**. Report bodies use ISO 8601 `startDate`/`endDate` strings instead.',
        '',
        '## Filters',
        '',
        FILTER_CONVENTION,
      ].join('\n'),
    },
    servers: [{ url: '/' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Send `Authorization: Bearer <credential>`. Two credential types are accepted: an API key (`umami_ak_...`, created via `POST /api/api-keys`; only its hash is stored server-side) or a login JWT obtained from `POST /api/auth/login`.',
        },
        jobsKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-umami-jobs-key',
          description:
            'Shared-secret header for the jobs runner (`POST /api/jobs/tick` only). Must match the server’s `JOBS_KEY` environment variable.',
        },
      },
      schemas: {
        Website: websiteSchema,
        WebsiteStats: websiteStatsSchema,
        SeriesPoint: seriesPointSchema,
        MetricRow: metricRowSchema,
        PagedResult: pagedResultSchema,
        ApiKey: apiKeySchema,
        AgentTrafficTotals: agentTrafficTotalsSchema,
        Alert: alertSchema,
        AlertEvent: alertEventSchema,
      },
    },
    paths: {
      '/api/me': {
        get: {
          operationId: 'getMe',
          summary: 'Get the authenticated identity',
          description:
            'Returns the auth context for the presented credential, including the user (`id`, `username`, `role`, `isAdmin`).',
          tags: ['auth'],
          responses: {
            '200': jsonResponse('Authenticated identity.', {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    username: { type: 'string' },
                    role: { type: 'string' },
                    isAdmin: { type: 'boolean' },
                  },
                },
              },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/api-keys': {
        get: {
          operationId: 'listApiKeys',
          summary: 'List API keys',
          description:
            "Lists the authenticated user's API keys (metadata only; the key value is never returned after creation). Fork endpoint (RFD 0001).",
          tags: ['auth'],
          responses: {
            '200': jsonResponse('API keys for the current user.', {
              type: 'array',
              items: { $ref: '#/components/schemas/ApiKey' },
            }),
            '401': unauthorizedResponse,
          },
        },
        post: {
          operationId: 'createApiKey',
          summary: 'Create an API key',
          description:
            'Creates an API key for the authenticated user. The response includes the plaintext key (`umami_ak_...`) **exactly once**; only its hash is stored. Fork endpoint (RFD 0001).',
          tags: ['auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', maxLength: 100 },
                    expiresAt: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Optional expiry; omit for a non-expiring key.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('The created key. Save `key` now — it is not retrievable later.', {
              allOf: [
                { $ref: '#/components/schemas/ApiKey' },
                {
                  type: 'object',
                  properties: {
                    key: {
                      type: 'string',
                      description: 'Plaintext API key (`umami_ak_...`), returned only here.',
                    },
                  },
                },
              ],
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/api-keys/{keyId}': {
        delete: {
          operationId: 'deleteApiKey',
          summary: 'Delete an API key',
          description:
            'Deletes (revokes) one of the authenticated user’s API keys. Fork endpoint (RFD 0001).',
          tags: ['auth'],
          parameters: [
            {
              name: 'keyId',
              in: 'path',
              required: true,
              description: 'API key id (UUID).',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': jsonResponse('Deleted.', {
              type: 'object',
              properties: { ok: { type: 'boolean', const: true } },
            }),
            '401': unauthorizedResponse,
            '404': { description: 'No such key owned by the current user.' },
          },
        },
      },
      '/api/websites': {
        get: {
          operationId: 'listWebsites',
          summary: 'List websites',
          description: 'Lists websites the authenticated user owns (paged).',
          tags: ['websites'],
          parameters: [
            ...pagingQueryParameters(),
            {
              name: 'orderBy',
              in: 'query',
              required: false,
              description: 'Field to sort by, e.g. `name`.',
              schema: { type: 'string' },
            },
            {
              name: 'sortDescending',
              in: 'query',
              required: false,
              description: 'Sort direction.',
              schema: { type: 'string', enum: ['true', 'false'] },
            },
            {
              name: 'maxResults',
              in: 'query',
              required: false,
              description: 'Cap on the number of results.',
              schema: { type: 'integer', minimum: 1 },
            },
            {
              name: 'includeTeams',
              in: 'query',
              required: false,
              description:
                'Any non-empty value also includes websites accessible via team membership.',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': jsonResponse('Paged list of websites.', {
              allOf: [
                { $ref: '#/components/schemas/PagedResult' },
                {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Website' } },
                  },
                },
              ],
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}': {
        get: {
          operationId: 'getWebsite',
          summary: 'Get a website',
          tags: ['websites'],
          parameters: [websiteIdPathParameter],
          responses: {
            '200': jsonResponse('The website.', { $ref: '#/components/schemas/Website' }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/stats': {
        get: {
          operationId: 'getWebsiteStats',
          summary: 'Aggregate stats for a date range',
          description:
            'Returns pageviews, visitors, visits, bounces and total time for the range, plus the same metrics for the comparison period (previous period unless `compare=yoy`).',
          tags: ['analytics'],
          parameters: [
            websiteIdPathParameter,
            ...dateRangeQueryParameters(),
            ...filterQueryParameters(),
          ],
          responses: {
            '200': jsonResponse('Aggregate stats.', { $ref: '#/components/schemas/WebsiteStats' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/pageviews': {
        get: {
          operationId: 'getWebsitePageviews',
          summary: 'Pageview and session time series',
          description:
            'Returns two series bucketed by `unit`: pageview counts and session (visitor) counts. With `compare` set, also returns the comparison-period series.',
          tags: ['analytics'],
          parameters: [
            websiteIdPathParameter,
            ...dateRangeQueryParameters(),
            ...filterQueryParameters(),
          ],
          responses: {
            '200': jsonResponse('Time series.', {
              type: 'object',
              properties: {
                pageviews: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SeriesPoint' },
                },
                sessions: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/SeriesPoint' },
                },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/metrics': {
        get: {
          operationId: 'getWebsiteMetrics',
          summary: 'Top-N breakdown by a field',
          description:
            'Returns the top values for one field (`type`) with visitor/event counts, e.g. top pages, referrers or countries.',
          tags: ['analytics'],
          parameters: [
            websiteIdPathParameter,
            {
              name: 'type',
              in: 'query',
              required: true,
              description: 'Field to break down by.',
              schema: {
                type: 'string',
                enum: [
                  'path',
                  'entry',
                  'exit',
                  'referrer',
                  'domain',
                  'title',
                  'query',
                  'event',
                  'tag',
                  'hostname',
                  'utmSource',
                  'utmMedium',
                  'utmCampaign',
                  'utmContent',
                  'utmTerm',
                  'browser',
                  'os',
                  'device',
                  'screen',
                  'language',
                  'country',
                  'region',
                  'city',
                  'distinctId',
                  'channel',
                ],
              },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of rows.',
              schema: { type: 'integer' },
            },
            {
              name: 'offset',
              in: 'query',
              required: false,
              schema: { type: 'integer' },
            },
            {
              name: 'search',
              in: 'query',
              required: false,
              description: 'Restrict rows to values containing this text.',
              schema: { type: 'string' },
            },
            ...dateRangeQueryParameters(),
            ...filterQueryParameters(),
          ],
          responses: {
            '200': jsonResponse('Breakdown rows, highest count first.', {
              type: 'array',
              items: { $ref: '#/components/schemas/MetricRow' },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/events': {
        get: {
          operationId: 'getWebsiteEvents',
          summary: 'List raw events',
          description: 'Paged list of pageview and custom events in the range.',
          tags: ['analytics'],
          parameters: [
            websiteIdPathParameter,
            ...dateRangeQueryParameters(),
            ...filterQueryParameters(),
            ...pagingQueryParameters(),
          ],
          responses: {
            '200': jsonResponse('Paged events.', { $ref: '#/components/schemas/PagedResult' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/sessions': {
        get: {
          operationId: 'getWebsiteSessions',
          summary: 'List sessions',
          description: 'Paged list of sessions in the range.',
          tags: ['analytics'],
          parameters: [
            websiteIdPathParameter,
            ...dateRangeQueryParameters(),
            ...filterQueryParameters(),
            ...pagingQueryParameters(),
          ],
          responses: {
            '200': jsonResponse('Paged sessions.', { $ref: '#/components/schemas/PagedResult' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/active': {
        get: {
          operationId: 'getActiveVisitors',
          summary: 'Active visitors right now',
          description: 'Count of distinct sessions with events in the last 5 minutes.',
          tags: ['analytics'],
          parameters: [websiteIdPathParameter],
          responses: {
            '200': jsonResponse('Active visitor count.', {
              type: 'object',
              properties: { visitors: { type: 'number' } },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/daterange': {
        get: {
          operationId: 'getWebsiteDateRange',
          summary: 'First and last recorded event',
          description: 'Returns the min/max event timestamps — the range that actually has data.',
          tags: ['analytics'],
          parameters: [websiteIdPathParameter],
          responses: {
            '200': jsonResponse('Data date range.', {
              type: 'object',
              properties: {
                startDate: { type: ['string', 'null'], format: 'date-time' },
                endDate: { type: ['string', 'null'], format: 'date-time' },
              },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/funnel': {
        post: {
          operationId: 'runFunnelReport',
          summary: 'Funnel report',
          description:
            'Conversion between 2–8 ordered steps (paths or events) within a time window of `window` minutes.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'funnel',
            {
              type: 'object',
              required: ['startDate', 'endDate', 'window', 'steps'],
              properties: {
                ...dateParametersFragment,
                window: {
                  type: 'number',
                  description: 'Conversion window in minutes between the first and last step.',
                },
                steps: {
                  type: 'array',
                  minItems: 2,
                  maxItems: 8,
                  items: {
                    type: 'object',
                    required: ['type', 'value'],
                    properties: {
                      type: { type: 'string', enum: ['path', 'event'] },
                      value: {
                        type: 'string',
                        description: 'Path or event name. `*` acts as a wildcard in paths.',
                      },
                      filters: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['property', 'operator', 'value'],
                          properties: {
                            property: { type: 'string', minLength: 1 },
                            operator: { type: 'string', enum: ['eq', 'neq', 'c', 'dnc'] },
                            value: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            'Funnel parameters.',
          ),
          responses: {
            '200': jsonResponse('Per-step visitor counts and drop-off.', {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'string' },
                  visitors: { type: 'number' },
                  previous: { type: 'number' },
                  dropped: { type: 'number' },
                  dropoff: { type: ['number', 'null'] },
                  remaining: { type: 'number' },
                },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/retention': {
        post: {
          operationId: 'runRetentionReport',
          summary: 'Retention report',
          description:
            'Cohort retention: for each first-visit date, how many visitors returned on later days.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'retention',
            {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: {
                ...dateParametersFragment,
                timezone: { type: 'string', description: 'IANA timezone.' },
              },
            },
            'Retention parameters.',
          ),
          responses: {
            '200': jsonResponse(
              'Cohort rows: date, day offset, visitor count, return percentage.',
              {
                type: 'array',
                items: { type: 'object' },
              },
            ),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/journey': {
        post: {
          operationId: 'runJourneyReport',
          summary: 'Journey report',
          description:
            'Common navigation sequences of 2–7 steps, optionally anchored to a start and/or end step.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'journey',
            {
              type: 'object',
              required: ['startDate', 'endDate', 'steps'],
              properties: {
                ...dateParametersFragment,
                steps: { type: 'integer', minimum: 2, maximum: 7 },
                startStep: {
                  type: 'string',
                  description: 'Path or event the journey must start with.',
                },
                endStep: {
                  type: 'string',
                  description: 'Path or event the journey must end with.',
                },
                eventType: {
                  type: 'integer',
                  description: 'Restrict to an event type: 1 = pageview, 2 = custom event.',
                },
              },
            },
            'Journey parameters.',
          ),
          responses: {
            '200': jsonResponse('Journey sequences with counts.', {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { type: ['string', 'null'] } },
                  count: { type: 'number' },
                },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/goal': {
        post: {
          operationId: 'runGoalReport',
          summary: 'Goal report',
          description: 'Visitors reaching a goal (a path visited or an event fired) in the range.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'goal',
            {
              type: 'object',
              required: ['startDate', 'endDate', 'type', 'value'],
              properties: {
                ...dateParametersFragment,
                type: { type: 'string', description: 'Goal type, e.g. `url` or `event`.' },
                value: { type: 'string', description: 'Path or event name for the goal.' },
              },
            },
            'Goal parameters.',
          ),
          responses: {
            '200': jsonResponse('Goal completion counts.', { type: 'object' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/attribution': {
        post: {
          operationId: 'runAttributionReport',
          summary: 'Attribution report',
          description:
            'Attributes conversions (a path visit or event) to marketing touchpoints using a first-click or last-click model.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'attribution',
            {
              type: 'object',
              required: ['startDate', 'endDate', 'model', 'type', 'step'],
              properties: {
                ...dateParametersFragment,
                model: { type: 'string', enum: ['first-click', 'last-click'] },
                type: { type: 'string', enum: ['path', 'event'] },
                step: { type: 'string', description: 'Conversion path or event name.' },
                currency: {
                  type: 'string',
                  description: 'Include revenue attribution in this currency.',
                },
              },
            },
            'Attribution parameters.',
          ),
          responses: {
            '200': jsonResponse('Attribution by referrer, channel, UTM dimensions.', {
              type: 'object',
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/utm': {
        post: {
          operationId: 'runUtmReport',
          summary: 'UTM report',
          description:
            'Event counts grouped by each UTM parameter (source, medium, campaign, term, content).',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'utm',
            {
              type: 'object',
              required: ['startDate', 'endDate'],
              properties: { ...dateParametersFragment },
            },
            'UTM parameters.',
          ),
          responses: {
            '200': jsonResponse('Rows per UTM dimension.', {
              type: 'object',
              properties: {
                utm_source: { type: 'array', items: { type: 'object' } },
                utm_medium: { type: 'array', items: { type: 'object' } },
                utm_campaign: { type: 'array', items: { type: 'object' } },
                utm_term: { type: 'array', items: { type: 'object' } },
                utm_content: { type: 'array', items: { type: 'object' } },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/reports/revenue': {
        post: {
          operationId: 'runRevenueReport',
          summary: 'Revenue report',
          description:
            'Revenue chart, totals with prior-period comparison, and breakdowns by country, region, referrer and channel.',
          tags: ['reports'],
          requestBody: reportRequestBody(
            'revenue',
            {
              type: 'object',
              required: ['startDate', 'endDate', 'currency'],
              properties: {
                ...dateParametersFragment,
                currency: { type: 'string', description: 'ISO currency code, e.g. `USD`.' },
                unit: {
                  type: 'string',
                  enum: ['year', 'month', 'day', 'hour', 'minute'],
                },
                timezone: { type: 'string' },
                compare: { type: 'string', enum: ['prev', 'yoy'] },
              },
            },
            'Revenue parameters.',
          ),
          responses: {
            '200': jsonResponse('Revenue chart, totals and breakdowns.', {
              type: 'object',
              properties: {
                chart: { type: 'array', items: { type: 'object' } },
                total: { type: 'object' },
                country: { type: 'array', items: { type: 'object' } },
                region: { type: 'array', items: { type: 'object' } },
                referrer: { type: 'array', items: { type: 'object' } },
                channel: { type: 'array', items: { type: 'object' } },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/collect': {
        post: {
          operationId: 'collect',
          summary: 'Server-side event collection',
          description:
            'Fork endpoint (RFD 0006). Accepts fire-and-forget hits from a site’s own server or edge middleware, so non-JS clients (AI crawlers, agents) are captured. Requires a bearer credential (API key or login JWT) whose user can view the target website — unlike `/api/send` this is authenticated, so caller-supplied `ip` and `userAgent` are trusted. The user agent is classified (RFD 0002): known bots/agents are recorded as agent events; everything else goes through the normal session/event pipeline like `/api/send`.',
          tags: ['collect'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['websiteId', 'url', 'userAgent'],
                  properties: {
                    websiteId: { type: 'string', format: 'uuid' },
                    url: {
                      type: 'string',
                      description: 'Page URL or absolute path of the request being reported.',
                    },
                    hostname: { type: 'string', maxLength: 100 },
                    referrer: { type: 'string', description: 'Referrer URL or path.' },
                    userAgent: {
                      type: 'string',
                      minLength: 1,
                      maxLength: 1000,
                      description: 'Raw User-Agent header of the original client.',
                    },
                    ip: {
                      type: 'string',
                      description:
                        'Client IP (v4 or v6) of the original request, used for geolocation and session hashing. Must be a valid IP if present.',
                    },
                    name: {
                      type: 'string',
                      description:
                        'Custom event name; omit for a pageview. Must not start with `=`, `+`, `-`, `@`, tab or carriage return.',
                    },
                    data: {
                      type: 'object',
                      additionalProperties: true,
                      description: 'Custom event data.',
                    },
                    timestamp: {
                      type: 'integer',
                      description:
                        'Event time as a Unix timestamp in **seconds**. Must not be in the future or older than 30 days. Defaults to now.',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': jsonResponse(
              'Hit recorded. Bot/agent traffic returns the classified category; human traffic returns the computed session/visit ids.',
              {
                oneOf: [
                  {
                    type: 'object',
                    description: 'The user agent was classified as a bot/agent (RFD 0002).',
                    required: ['ok', 'classified'],
                    properties: {
                      ok: { type: 'boolean', const: true },
                      classified: {
                        type: 'string',
                        enum: [
                          'ai_crawler',
                          'ai_agent',
                          'ai_search',
                          'search_crawler',
                          'seo_tool',
                          'monitoring',
                          'other_bot',
                        ],
                        description: 'Agent category the hit was recorded under.',
                      },
                    },
                  },
                  {
                    type: 'object',
                    description:
                      'Human traffic recorded through the normal session/event pipeline.',
                    required: ['ok', 'sessionId', 'visitId'],
                    properties: {
                      ok: { type: 'boolean', const: true },
                      sessionId: { type: 'string', format: 'uuid' },
                      visitId: { type: 'string', format: 'uuid' },
                    },
                  },
                ],
              },
            ),
            '400': {
              description:
                'Validation error: invalid body, invalid `ip`, or `timestamp` in the future / older than 30 days.',
            },
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/stats': {
        get: {
          operationId: 'getAgentTrafficStats',
          summary: 'AI & bot traffic totals',
          description:
            'Fork endpoint (RFD 0007). Totals of classified bot/agent traffic for the range, with the same totals for the immediately preceding period of equal length.',
          tags: ['agents'],
          parameters: [websiteIdPathParameter, ...agentDateQueryParameters()],
          responses: {
            '200': jsonResponse('Agent traffic totals for the current and previous period.', {
              type: 'object',
              properties: {
                current: { $ref: '#/components/schemas/AgentTrafficTotals' },
                previous: { $ref: '#/components/schemas/AgentTrafficTotals' },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/series': {
        get: {
          operationId: 'getAgentTrafficSeries',
          summary: 'AI & bot traffic time series',
          description:
            'Fork endpoint (RFD 0007). Agent event counts over time, one row per (time bucket, category) pair.',
          tags: ['agents'],
          parameters: [
            websiteIdPathParameter,
            ...agentDateQueryParameters(),
            {
              name: 'unit',
              in: 'query',
              required: false,
              description: 'Time bucket (default `day`).',
              schema: { type: 'string', enum: ['year', 'month', 'day', 'hour', 'minute'] },
            },
            {
              name: 'timezone',
              in: 'query',
              required: false,
              description: 'IANA timezone used for date bucketing (default UTC).',
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': jsonResponse('Series rows ordered by bucket.', {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  t: { type: 'string', description: 'Bucket start.' },
                  category: {
                    type: 'string',
                    description: 'Agent category (`ai_crawler`, `ai_agent`, `ai_search`, ...).',
                  },
                  count: { type: 'number' },
                },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/metrics': {
        get: {
          operationId: 'getAgentTrafficMetrics',
          summary: 'AI & bot traffic breakdown',
          description:
            'Fork endpoint (RFD 0007). Top agent names, operators or fetched paths by event count.',
          tags: ['agents'],
          parameters: [
            websiteIdPathParameter,
            ...agentDateQueryParameters(),
            {
              name: 'type',
              in: 'query',
              required: false,
              description: 'Field to break down by (default `name`).',
              schema: { type: 'string', enum: ['name', 'operator', 'path'] },
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              description: 'Maximum number of rows (default 20).',
              schema: { type: 'integer', minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            '200': jsonResponse('Breakdown rows, highest count first.', {
              type: 'array',
              items: { $ref: '#/components/schemas/MetricRow' },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/ai/query': {
        post: {
          operationId: 'askAnalytics',
          summary: 'Ask the analytics AI a question',
          description:
            'Fork endpoint (RFD 0009). Answers a natural-language question about a website’s analytics using an LLM with read-only analytics tools. **Env-gated:** returns `404` unless the server is configured with `ANTHROPIC_API_KEY`.',
          tags: ['ai'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['websiteId', 'question'],
                  properties: {
                    websiteId: { type: 'string', format: 'uuid' },
                    question: { type: 'string', minLength: 1, maxLength: 1000 },
                    history: {
                      type: 'array',
                      maxItems: 10,
                      description: 'Prior conversation turns, oldest first.',
                      items: {
                        type: 'object',
                        required: ['role', 'content'],
                        properties: {
                          role: { type: 'string', enum: ['user', 'assistant'] },
                          content: { type: 'string', maxLength: 4000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('The answer plus the analytics tool calls made to produce it.', {
              type: 'object',
              properties: {
                answer: { type: 'string' },
                toolCalls: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      args: { type: 'object', additionalProperties: true },
                    },
                  },
                },
              },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
            '404': {
              description: 'AI features are not enabled (`ANTHROPIC_API_KEY` is not configured).',
            },
          },
        },
      },
      '/api/alerts': {
        get: {
          operationId: 'listAlerts',
          summary: 'List alerts for a website',
          description: 'Fork endpoint (RFD 0008). Lists the alerts configured for a website.',
          tags: ['alerts'],
          parameters: [
            {
              name: 'websiteId',
              in: 'query',
              required: true,
              description: 'Website id (UUID).',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': jsonResponse('Alerts for the website.', {
              type: 'array',
              items: { $ref: '#/components/schemas/Alert' },
            }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
        post: {
          operationId: 'createAlert',
          summary: 'Create an alert',
          description:
            'Fork endpoint (RFD 0008). Creates an alert on a website. Requires update permission on the website. Channel URLs must be public http(s) addresses (SSRF-guarded).',
          tags: ['alerts'],
          requestBody: alertRequestBody(true),
          responses: {
            '200': jsonResponse('The created alert.', { $ref: '#/components/schemas/Alert' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/alerts/{alertId}': {
        get: {
          operationId: 'getAlert',
          summary: 'Get an alert with recent events',
          description:
            'Fork endpoint (RFD 0008). Returns the alert plus its most recent 50 trigger/error events.',
          tags: ['alerts'],
          parameters: [alertIdPathParameter],
          responses: {
            '200': jsonResponse('The alert with its recent events.', {
              allOf: [
                { $ref: '#/components/schemas/Alert' },
                {
                  type: 'object',
                  properties: {
                    events: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AlertEvent' },
                    },
                  },
                },
              ],
            }),
            '401': unauthorizedResponse,
            '404': { description: 'Alert not found.' },
          },
        },
        post: {
          operationId: 'updateAlert',
          summary: 'Update an alert',
          description:
            'Fork endpoint (RFD 0008). Partial update; all fields optional. Editing reschedules the alert to run on the next tick.',
          tags: ['alerts'],
          parameters: [alertIdPathParameter],
          requestBody: alertRequestBody(false),
          responses: {
            '200': jsonResponse('The updated alert.', { $ref: '#/components/schemas/Alert' }),
            '400': badRequestResponse,
            '401': unauthorizedResponse,
            '404': { description: 'Alert not found.' },
          },
        },
        delete: {
          operationId: 'deleteAlert',
          summary: 'Delete an alert',
          description: 'Fork endpoint (RFD 0008). Soft-deletes the alert.',
          tags: ['alerts'],
          parameters: [alertIdPathParameter],
          responses: {
            '200': jsonResponse('Deleted.', {
              type: 'object',
              properties: { ok: { type: 'boolean', const: true } },
            }),
            '401': unauthorizedResponse,
            '404': { description: 'Alert not found.' },
          },
        },
      },
      '/api/jobs/tick': {
        post: {
          operationId: 'runJobsTick',
          summary: 'Run the jobs scheduler tick',
          description:
            'Fork endpoint (RFD 0008). Idempotent scheduler entry point, meant to be called by an external cron (e.g. every minute). Evaluates all due alerts and sends notifications. Authorized either by the `x-umami-jobs-key` header matching the server’s `JOBS_KEY` env var, or by an admin bearer credential.',
          tags: ['jobs'],
          security: [{ jobsKey: [] }, { bearerAuth: [] }],
          responses: {
            '200': jsonResponse('Tick summary.', {
              type: 'object',
              properties: {
                processed: { type: 'number', description: 'Alerts evaluated this tick.' },
                triggered: { type: 'number', description: 'Alerts that fired notifications.' },
                errors: { type: 'number', description: 'Alerts that failed to evaluate.' },
              },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/mcp': {
        post: {
          operationId: 'mcp',
          summary: 'MCP endpoint (JSON-RPC 2.0)',
          description:
            'Fork endpoint (RFD 0005). Stateless Model Context Protocol endpoint speaking JSON-RPC 2.0 over HTTP POST. Supported methods: `initialize`, `tools/list`, `tools/call`. Point an MCP client at this URL with a bearer API key; the request/response envelopes follow the MCP specification and are not modeled in this document.',
          tags: ['mcp'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description:
                    'A JSON-RPC 2.0 request object (`{ jsonrpc: "2.0", id, method, params }`). See the MCP specification.',
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            '200': jsonResponse('A JSON-RPC 2.0 response object (result or error).', {
              type: 'object',
              additionalProperties: true,
            }),
            '401': unauthorizedResponse,
          },
        },
      },
    },
  };
}
