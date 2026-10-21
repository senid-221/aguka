import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { getAIProvider } from '@/lib/ai/provider-adapter';
import { detectLanguage } from '@/lib/ai/bilingual-router';

const CODING_SYSTEM_INSTRUCTION =
  'You are a senior software engineer helping a builder in Rwanda. Return code and explanations in ' +
  'Markdown. Write only code you are certain compiles or runs; when something must be adapted, say so ' +
  'explicitly. Never claim that code was executed, tested or benchmarked — nothing is run here.';

export async function GET() {
  const tasks = repo.getCodingTasks();
  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, title, taskType, language, code, inputPrompt } = await request.json();

    if (!userId || !inputPrompt) {
      return NextResponse.json({ error: 'userId and inputPrompt are required' }, { status: 400 });
    }

    const resolvedTaskType = taskType || 'EXPLAIN';
    const provider = getAIProvider();

    let outputResult = '';
    let status: 'PENDING' | 'COMPLETED' | 'FAILED' = 'PENDING';

    if (!provider) {
      outputResult =
        'GEMINI_API_KEY is not configured on this server, so no code was generated. Task stored as PENDING.';
    } else {
      const taskGoal =
        resolvedTaskType === 'SCAFFOLD'
          ? 'Produce a production-ready scaffold.'
          : resolvedTaskType === 'DEBUG'
          ? 'Find and fix the defect, explaining the root cause.'
          : resolvedTaskType === 'SANDBOX_RUN'
          ? 'Review this code for runtime behaviour and likely failures. Note: it cannot be executed here.'
          : 'Explain the requested approach and trade-offs.';

      const prompt =
        `Language: ${language || 'typescript'}\n` +
        `Request language: ${detectLanguage(inputPrompt) === 'KINYARWANDA' ? 'reply in Kinyarwanda, keep code identifiers in English' : 'reply in English'}\n` +
        `${taskGoal}\n\nRequest: ${inputPrompt}` +
        (code ? `\n\nCode under review:\n${code}` : '');

      try {
        const generated = await provider.generateResponse(prompt, CODING_SYSTEM_INSTRUCTION);
        outputResult = generated.text;
        status = generated.text.trim().length > 0 ? 'COMPLETED' : 'FAILED';
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        outputResult = `The AI provider could not answer: ${errorMsg}`;
        status = 'FAILED';
      }
    }

    const created = repo.createCodingTask({
      userId,
      title: title || 'Coding request',
      taskType: resolvedTaskType,
      language: language || 'typescript',
      code: code || '',
      inputPrompt,
      outputResult,
      status,
    });

    return NextResponse.json({
      success: true,
      task: created,
      aiProvider: provider ? provider.name : 'not-configured',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
