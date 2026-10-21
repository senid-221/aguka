import { NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
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
