import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/security/admin-auth';
import { runPlatformTestSuiteAsync } from '@/lib/testing/suite';

// Running the suite is a full platform exercise, not a page view. It belongs to the
// dashboard, and an anonymous caller must not be able to trigger it on demand.
export async function GET(request: NextRequest) {
  if (!requireAdmin(request).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const testResults = await runPlatformTestSuiteAsync();
  return NextResponse.json(testResults, { status: 200 });
}
