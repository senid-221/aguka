import { NextRequest, NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';
import { generateText, chainSummary } from '@/lib/ai/provider-adapter';
import { detectLanguage } from '@/lib/ai/bilingual-router';
import { logger } from '@/lib/logging/logger';

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
    const chain = chainSummary();

    let outputResult = '';
    let status: 'PENDING' | 'COMPLETED' | 'FAILED' = 'PENDING';
    let answeredBy: string | null = null;

    if (!chain.configured) {
      outputResult =
        'No AI provider key is configured on this server (GEMINI_API_KEY, or OPENAI_API_KEY as the rescue), so no code was generated. Task stored as PENDING.';
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
        const generated = await generateText(prompt, CODING_SYSTEM_INSTRUCTION);
        outputResult = generated.text;
        answeredBy = `${generated.provider}:${generated.model}${generated.fellBack ? ' (rescue)' : ''}`;
        status = 'COMPLETED';
      } catch (err: unknown) {
        // The provider's own error text stays in the log; the stored task carries the
        // order that was tried so an operator can see it without pasting a secret.
        logger.error('AI_GENERATION_FAILED', err instanceof Error ? err : new Error(String(err)), {
          metadata: { route: 'coding', taskType: resolvedTaskType },
        });
        outputResult = `No text provider answered (${chainSummary().order
          .map((p) => `${p.provider}:${p.model}`)
          .join(' → ')}). Nothing was generated.`;
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
      aiProvidersTried: chain.order.map((p) => `${p.provider}:${p.model}`),
      answeredBy: answeredBy ?? 'no-provider-answered',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
