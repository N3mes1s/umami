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
      },
      schemas: {
        Website: websiteSchema,
        WebsiteStats: websiteStatsSchema,
        SeriesPoint: seriesPointSchema,
        MetricRow: metricRowSchema,
        PagedResult: pagedResultSchema,
        ApiKey: apiKeySchema,
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
          summary: '[STUB] Server-side event collection (fork, ships in RFD 0006)',
          description:
            'STUB — not yet implemented in this build. (fork, ships in RFD 0006/0007). API-key-authenticated server/edge collection endpoint: sends a hit for every HTTP request so non-JS clients (AI crawlers, agents) are captured.',
          tags: ['fork-stubs'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['websiteId', 'url', 'userAgent'],
                  properties: {
                    websiteId: { type: 'string', format: 'uuid' },
                    url: { type: 'string' },
                    userAgent: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '202': { description: 'Accepted.' },
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/stats': {
        get: {
          operationId: 'getAgentTrafficStats',
          summary: '[STUB] AI agent traffic totals (fork, ships in RFD 0006/0007)',
          description:
            'STUB — not yet implemented in this build. (fork, ships in RFD 0006/0007). Totals and per-category counts of AI crawler/agent traffic with prior-period comparison.',
          tags: ['fork-stubs'],
          parameters: [websiteIdPathParameter],
          responses: {
            '200': jsonResponse('Agent traffic stats.', { type: 'object' }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/series': {
        get: {
          operationId: 'getAgentTrafficSeries',
          summary: '[STUB] AI agent traffic time series (fork, ships in RFD 0006/0007)',
          description:
            'STUB — not yet implemented in this build. (fork, ships in RFD 0006/0007). Agent events over time grouped by category.',
          tags: ['fork-stubs'],
          parameters: [websiteIdPathParameter],
          responses: {
            '200': jsonResponse('Agent traffic series.', {
              type: 'array',
              items: { type: 'object' },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
      '/api/websites/{websiteId}/agents/metrics': {
        get: {
          operationId: 'getAgentTrafficMetrics',
          summary: '[STUB] AI agent traffic breakdown (fork, ships in RFD 0006/0007)',
          description:
            'STUB — not yet implemented in this build. (fork, ships in RFD 0006/0007). Top agents by name, operator or fetched path.',
          tags: ['fork-stubs'],
          parameters: [
            websiteIdPathParameter,
            {
              name: 'type',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['name', 'operator', 'path'] },
            },
          ],
          responses: {
            '200': jsonResponse('Agent metrics rows.', {
              type: 'array',
              items: { type: 'object' },
            }),
            '401': unauthorizedResponse,
          },
        },
      },
    },
  };
}
