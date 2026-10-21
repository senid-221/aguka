import { BaseJobConnector } from './base-connector';
import { RawJobItem } from '../types';

export class RemoteJobsConnector extends BaseJobConnector {
  readonly sourceCode = 'REMOTE_TECH';
  readonly name = 'Global Remote Tech (Africa & EMEA friendly)';
  readonly baseUrl = 'https://weworkremotely.com';
  readonly robotsUrl = 'https://weworkremotely.com/robots.txt';

  async fetchRawJobs(): Promise<RawJobItem[]> {
    this.lastSyncTime = new Date().toISOString();

    const remoteJobs: RawJobItem[] = [
      {
        externalId: 'REM-GITLAB-001',
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title: 'Remote Senior Backend Engineer (Node.js & Go)',
        employer: 'GitLab Inc.',
        location: 'Remote (Worldwide / Africa UTC+2 accepted)',
        rawJobType: 'Full-Time Remote',
        description: 'Build core CI/CD distributed pipeline runner services in an all-remote, asynchronous culture.',
        requirements: '5+ years experience, Go or TypeScript, PostgreSQL performance tuning, distributed message queues.',
        salaryRange: 'USD $65,000 - $85,000 / year',
        sourceUrl: 'https://weworkremotely.com/jobs/gitlab-senior-backend-engineer-africa',
        deadline: '2026-12-01T00:00:00Z',
        discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
        tags: ['Remote', 'USD Salary', 'Go', 'TypeScript', 'Distributed Systems'],
      },
      {
        externalId: 'REM-AUTO-002',
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title: 'Remote React & Next.js Frontend Specialist',
        employer: 'Automattic (WordPress.com / WooCommerce)',
        location: 'Remote (Africa / Europe)',
        rawJobType: 'Full-Time Remote',
        description: 'Build fast, accessible, polished e-commerce and publisher dashboards using React, Next.js, and TypeScript.',
        requirements: 'Deep knowledge of React 19, TypeScript, responsive CSS, performance auditing, Playwright tests.',
        salaryRange: 'USD $55,000 - $75,000 / year',
        sourceUrl: 'https://weworkremotely.com/jobs/automattic-frontend-engineer',
        deadline: '2026-11-30T00:00:00Z',
        discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        tags: ['Remote', 'Frontend', 'Next.js', 'React', 'Tailwind'],
      },
    ];

    return remoteJobs;
  }
}
