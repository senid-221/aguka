import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';

// Agent runs, tool traces and webhook events record other people's message ids and
// conversation references. Only an administrator session reads them.
export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const agentRuns = repo.getAgentRuns();
  const toolCallTraces = repo.getToolCallTraces();
  const webhookEvents = repo.getWebhookEvents();
  const queuedJobs = repo.getQueuedJobs();

  return NextResponse.json({
    agentRuns,
    toolCallTraces,
    webhookEvents,
    queuedJobs,
  });
}
