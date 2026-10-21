/**
 * Standalone Aguka queue worker.
 *
 * Run this on an always-on host (a VPS, Railway, Render) next to the web server.
 * Serverless platforms freeze functions between requests, so a BullMQ worker
 * started inside them would half-process jobs.
 */
// The Next server loads .env for the web process; this script has to do it itself,
// otherwise a REDIS_URL that works in the app is invisible here. Absence is normal on
// hosts that inject real environment variables instead of a file.
try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

process.env.AGUKA_DATA_DIR = process.env.AGUKA_DATA_DIR || '.aguka-data';

async function runQueueWorker() {
  const { startQueueWorker, getQueueEndpointLabel, queueService } = await import('@/lib/queue/redis-queue');

  if (!startQueueWorker()) {
    console.error(
      'Aguka worker stopped: REDIS_URL (or UPSTASH_REDIS_TCP_HOST + UPSTASH_REDIS_TOKEN) is not set,\n' +
        'so there is no Redis queue to read. Set a redis:// or rediss:// endpoint and start again,\n' +
        'or let the web process run its in-process queue as it does today.'
    );
    process.exit(1);
  }

  const label = getQueueEndpointLabel();
  console.log(`Aguka queue worker attached to Redis BullMQ · ${label}`);
  console.log(
    'Note: with the file-backed JSON store this process and the web server are two writers on the\n' +
      'same snapshot. Keep QUEUE_INLINE_WORKER=true inside the web process until the Postgres backend\n' +
      'is live, and run this separate worker only against a real database.'
  );
  console.log('Waiting for jobs. Ctrl+C to stop.');

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`${signal} received, closing the worker...`);
    await queueService.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

runQueueWorker().catch((err) => {
  console.error('Fatal error starting the Aguka queue worker:', err);
  process.exit(1);
});
