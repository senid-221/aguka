import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { getAIProvider } from '@/lib/ai/provider-adapter';
import { LanguagePreference, QuizItem } from '@/lib/types';

const TUTOR_SYSTEM_INSTRUCTION =
  'You are a tutor for Rwandan students. Explain the requested concept accurately and simply. ' +
  'Write only what you are confident is correct, and never invent marks, curricula or exam dates.';

function toQuizzes(raw: unknown, sessionId: string): QuizItem[] {
  if (!Array.isArray(raw)) return [];
  const quizzes: QuizItem[] = [];

  raw.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const candidate = item as Record<string, unknown>;
    const question = typeof candidate.question === 'string' ? candidate.question : '';
    const options = Array.isArray(candidate.options)
      ? candidate.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      : [];
    const correctIndex =
      typeof candidate.correctIndex === 'number' && candidate.correctIndex >= 0 && candidate.correctIndex < options.length
        ? candidate.correctIndex
        : -1;

    if (!question || options.length < 2 || correctIndex < 0) return;

    quizzes.push({
      id: `${sessionId}-q${idx + 1}`,
      question,
      options,
      correctIndex,
      explanation: typeof candidate.explanation === 'string' ? candidate.explanation : '',
    });
  });

  return quizzes;
}

export async function GET() {
  const sessions = repo.getStudySessions();
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action !== 'CREATE_SESSION') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const { userId, subject, topic, language } = body;
    if (!userId || !topic) {
      return NextResponse.json({ error: 'userId and topic are required' }, { status: 400 });
    }

    const preferred: LanguagePreference = language === 'ENGLISH' ? 'ENGLISH' : 'KINYARWANDA';
    const provider = getAIProvider();

    if (!provider) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on this server, so no lesson can be generated.' },
        { status: 503 }
      );
    }

    const prompt =
      `Student user id: ${userId}\n` +
      `Subject: ${subject || 'General'}\n` +
      `Topic: ${topic}\n` +
      `Language: ${preferred === 'KINYARWANDA' ? 'Kinyarwanda' : 'English'}\n\n` +
      'Reply with JSON only in this shape:\n' +
      '{"notes": "clear explanation, 150-250 words", ' +
      '"quizzes": [{"question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "explanation": "..."}]}\n' +
      'Include exactly 2 quiz questions.';

    let notes = '';
    let quizzes: QuizItem[] = [];
    const sessionId = `study-${Date.now()}`;

    try {
      const generated = await provider.generateResponse(prompt, TUTOR_SYSTEM_INSTRUCTION, { json: true });
      const parsed = JSON.parse(generated.text) as Record<string, unknown>;
      notes = typeof parsed.notes === 'string' ? parsed.notes : generated.text;
      quizzes = toQuizzes(parsed.quizzes, sessionId);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `The tutor could not produce a lesson: ${errorMsg}` },
        { status: 502 }
      );
    }

    const created = repo.createStudySession({
      id: sessionId,
      userId,
      subject: subject || 'General',
      topic,
      language: preferred,
      notes,
      quizzes,
    });

    return NextResponse.json({ success: true, session: created });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
