import crypto from 'node:crypto';
import { runDueAlerts } from '@/lib/alerts';
import { checkAuth } from '@/lib/auth';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Jobs tick (RFD 0008): idempotent scheduler entry point, called by any
 * external cron. Authorized via the JOBS_KEY header or an admin session.
 */
export async function POST(request: Request) {
  const { error } = await parseRequest(request, undefined, { skipAuth: true });

  if (error) {
    return error();
  }

  const headerKey = request.headers.get('x-umami-jobs-key');
  const jobsKey = process.env.JOBS_KEY;

  let authorized = !!(headerKey && jobsKey && safeEqual(headerKey, jobsKey));

  if (!authorized) {
    const auth = await checkAuth(request);

    authorized = !!auth?.user?.isAdmin;
  }

  if (!authorized) {
    return unauthorized();
  }

  const result = await runDueAlerts();

  return json(result);
}

export async function GET() {
  return Response.json(
    {
      error: { message: 'Method not allowed', code: 'method-not-allowed', status: 405 },
    },
    { status: 405, headers: { allow: 'POST' } },
  );
}
