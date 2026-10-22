import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { requireAdmin } from '@/lib/security/admin-auth';

// Worker profiles carry a name and a phone number; an unauthenticated list is a
// directory of private data.
export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_WORKER') {
      const { userId, fullName, phoneNumber, title } = body;
      if (!userId || !fullName || !phoneNumber || !title) {
        return NextResponse.json(
          { error: 'userId, fullName, phoneNumber and title are required' },
          { status: 400 }
        );
      }

      const created = repo.createWorkerProfile({
        userId,
        fullName,
        phoneNumber,
        title,
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
