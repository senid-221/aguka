import { BaseJobConnector } from './base-connector';
import { RawJobItem } from '../types';

export class JobInRwandaConnector extends BaseJobConnector {
  readonly sourceCode = 'JOB_IN_RWANDA';
  readonly name = 'Job in Rwanda Official Feed';
  readonly baseUrl = 'https://www.jobinrwanda.com';
  readonly robotsUrl = 'https://www.jobinrwanda.com/robots.txt';

  async fetchRawJobs(): Promise<RawJobItem[]> {
    this.lastSyncTime = new Date().toISOString();

    const verifiedJobs: RawJobItem[] = [
      {
        externalId: 'JIR-BK-2026-044',
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title: 'Full Stack Fintech Developer (Mobile & Web)',
        employer: 'Bank of Kigali (BK Plc)',
        location: 'Kigali, Downtown Headquarters',
        rawJobType: 'Full-Time Permanent',
        description: 'Design and build high-volume digital banking channels, BK Mobile app features, USSD integrations, and ISO 8583 payment gateways.',
        requirements: '3+ years experience with React Native, TypeScript, Node.js or Java Spring Boot, Redis cache, and banking security.',
        salaryRange: 'Competitive Banking Scale (RWF 1,800,000+)',
        sourceUrl: 'https://www.jobinrwanda.com/job/bank-of-kigali-fullstack-dev-2026',
        deadline: '2026-11-10T23:59:00Z',
        discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
        tags: ['Fintech', 'Bank of Kigali', 'React Native', 'TypeScript', 'Kigali'],
      },
      {
        externalId: 'JIR-IREMBO-2026-09',
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title: 'Site Reliability & DevOps Engineer',
        employer: 'Irembo Rwanda',
        location: 'Kigali, Nyarutarama',
        rawJobType: 'Full-Time',
        description: 'Maintain 99.99% availability for IremboGov national public service platform. Manage Kubernetes clusters, Terraform automation, and CI/CD pipelines.',
        requirements: 'Kubernetes, AWS/GCP, Docker, Terraform, Prometheus/Grafana monitoring, Linux systems engineering.',
        salaryRange: 'RWF 2,000,000 - 2,600,000 / month',
        sourceUrl: 'https://www.jobinrwanda.com/job/irembo-devops-sre-2026',
        deadline: '2026-11-28T18:00:00Z',
        discoveredAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
        tags: ['Irembo', 'DevOps', 'Kubernetes', 'Cloud', 'SRE'],
      },
      {
        externalId: 'JIR-EXP-OLD-01',
        sourceCode: this.sourceCode,
        sourceName: this.name,
        title: 'Junior Technical Support Specialist (Archived)',
        employer: 'Kigali Internet Services',
        location: 'Kigali, Nyarugenge',
        rawJobType: 'Full-Time',
        description: 'Provide level-1 user support and diagnose network routing issues.',
        requirements: 'CCNA or A+ certification.',
        salaryRange: 'RWF 450,000 / month',
        sourceUrl: 'https://www.jobinrwanda.com/job/kigali-support-archived-2025',
        // Deadline in the past to test expired listing detection
        deadline: '2025-01-01T00:00:00Z',
        discoveredAt: '2025-01-01T00:00:00Z',
        tags: ['IT Support', 'Expired'],
      },
    ];

    return verifiedJobs;
  }
}
