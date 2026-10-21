import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
  const sessions = repo.getStudySessions();
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_SESSION') {
      const created = repo.createStudySession({
        userId: body.userId || 'usr-rw-04',
        subject: body.subject,
        topic: body.topic,
        language: body.language || 'KINYARWANDA',
        notes: body.notes || 'Incamake y’isomo...',
        quizzes: body.quizzes || [],
      });
      return NextResponse.json({ success: true, session: created });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
