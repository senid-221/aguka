import { NextResponse } from 'next/server';
import { runPlatformTestSuiteAsync } from '@/lib/testing/suite';

export async function GET() {
  const testResults = await runPlatformTestSuiteAsync();
  return NextResponse.json(testResults, { status: 200 });
}
