import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aguka AI - Rwanda WhatsApp Agent Platform',
  description: 'Bilingual (Kinyarwanda & English) WhatsApp AI agent platform for Rwanda: job discovery, career and CV support, coding help as text, passport photo guidance, study tutoring, and an employment marketplace.',
  openGraph: {
    title: 'Aguka AI - Rwanda WhatsApp Agent Platform',
    description: 'Bilingual AI WhatsApp assistant powering jobs, careers, coding, and education for Rwanda.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aguka AI - Rwanda WhatsApp Agent Platform',
    description: 'Bilingual AI WhatsApp assistant powering jobs, careers, coding, and education for Rwanda.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen selection:bg-emerald-500/30 selection:text-emerald-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
