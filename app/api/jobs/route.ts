import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';
import { crawlOneSource } from '@/lib/jobs/crawler';
import { jobDiscoveryConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get('keyword') || undefined;
  const sourceCode = searchParams.get('sourceCode') || undefined;
  const isRemote = searchParams.get('isRemote') === 'true' ? true : undefined;
  const verificationStatus = searchParams.get('verificationStatus') || undefined;

  const jobs = repo.getJobs({ keyword, sourceCode, isRemote, verificationStatus });
  const sources = repo.getSources();

  return NextResponse.json({
    jobs,
    sources,
    totalCount: jobs.length,
    crawl: jobDiscoveryConfig(),
  });
}

export async function POST(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'VERIFY_JOB') {
      const updated = repo.verifyJob(body.jobId);
      return NextResponse.json({ success: true, job: updated });
    }

    if (action === 'CRAWL_SOURCE') {
      // Runs the board here and now: the answer is what the site actually returned,
      // including the reason when it cannot be read.
      const result = await crawlOneSource(String(body.sourceCode || ''), repo);
      return NextResponse.json({ success: result.status === 'OK', result });
    }

    if (action === 'CREATE_JOB') {
      const source = repo.getSources().find((s) => s.id === body.sourceId);
      if (!source) {
        return NextResponse.json({ error: 'A valid sourceId is required' }, { status: 400 });
      }
      if (!body.title || !body.employer || !body.description || !body.sourceUrl) {
        return NextResponse.json(
          { error: 'title, employer, description and sourceUrl are required' },
          { status: 400 }
        );
      }

      const newJob = repo.addJobListing({
        sourceId: source.id,
        sourceName: source.name,
        externalId: body.externalId,
        title: body.title,
        employer: body.employer,
        location: body.location || 'Kigali, Rwanda',
        jobType: body.jobType || 'FULL_TIME',
        description: body.description,
        requirements: body.requirements,
        salaryRange: body.salaryRange,
        sourceUrl: body.sourceUrl,
        deadline: body.deadline,
        verificationStatus: 'PENDING',
        isExpired: false,
        tags: body.tags || [],
      });
      return NextResponse.json({ success: true, job: newJob });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
