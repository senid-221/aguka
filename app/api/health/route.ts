import { NextResponse } from 'next/server';
import { repo } from '@/lib/db/repository';

export async function GET() {
  const health = repo.getSystemHealth();
  return NextResponse.json(health, { status: 200 });
}
