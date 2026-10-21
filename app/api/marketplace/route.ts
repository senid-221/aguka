import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
  const workers = repo.getWorkerProfiles();
  const employers = repo.getEmployerProfiles();
  const vacancies = repo.getVacancies();
  const matches = repo.getJobMatches();

  return NextResponse.json({
    workers,
    employers,
    vacancies,
    matches,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_WORKER') {
      const created = repo.createWorkerProfile({
        userId: body.userId || `usr-${Date.now()}`,
        fullName: body.fullName,
        phoneNumber: body.phoneNumber,
        title: body.title,
        bio: body.bio,
        skills: body.skills || [],
        experienceYrs: Number(body.experienceYrs || 0),
        district: body.district || 'Kigali',
        isAvailable: true,
        hourlyRateRwf: body.hourlyRateRwf ? Number(body.hourlyRateRwf) : undefined,
      });
      return NextResponse.json({ success: true, worker: created });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
