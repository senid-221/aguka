import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface PrismaReadiness {
  prismaInstalled: boolean;
  schemaFilePresent: boolean;
  migrationsPresent: number;
  applied: boolean;
  note: string;
}

let cached: PrismaReadiness | null = null;

/**
 * Reports, without pretending, how far the production PostgreSQL path has got:
 * schema and migration SQL can exist while the Prisma client is not installed
 * and no database is reachable, in which case nothing has been applied.
 */
export function detectPrismaReadiness(cwd = process.cwd()): PrismaReadiness {
  if (cached) return cached;

  const schemaPath = path.join(cwd, 'prisma', 'schema.prisma');
  const migrationsDir = path.join(cwd, 'prisma', 'migrations');
  const schemaFilePresent = existsSync(schemaPath);

  let migrationsPresent = 0;
  if (existsSync(migrationsDir)) {
    migrationsPresent = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  }

  let prismaInstalled = false;
  try {
    prismaInstalled = existsSync(path.join(cwd, 'node_modules', '@prisma', 'client'));
  } catch {
    prismaInstalled = false;
  }

  const usesPostgres = schemaFilePresent
    ? readFileSync(schemaPath, 'utf8').includes('provider = "postgresql"')
    : false;
  const applied = prismaInstalled && Boolean(process.env.DATABASE_URL) && usesPostgres;

  cached = {
    prismaInstalled,
    schemaFilePresent,
    migrationsPresent,
    applied,
    note: applied
      ? 'Prisma client present and DATABASE_URL configured; live tables are authoritative.'
      : 'Prisma schema and migration SQL describe the target PostgreSQL model, but the client is not installed here, so live persistence runs on the durable file store until "npm install prisma @prisma/client && npx prisma migrate deploy" is run.',
  };
  return cached;
}
