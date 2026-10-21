'use client';

import React, { useState } from 'react';
import { Sidebar, ScreenId } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { OverviewDashboard } from '@/components/screens/overview-dashboard';
import { SimulatorScreen } from '@/components/screens/simulator-screen';
import { ConversationsScreen } from '@/components/screens/conversations-screen';
import { AgentsScreen } from '@/components/screens/agents-screen';
import { ServicesPricingScreen } from '@/components/screens/services-pricing-screen';
import { RoadSafetyAdminScreen } from '@/components/screens/road-safety-admin-screen';
import { PaymentsReviewScreen } from '@/components/screens/payments-review-screen';
import { AccessAuditScreen } from '@/components/screens/access-audit-screen';
import { JobsScreen } from '@/components/screens/jobs-screen';
import { EmploymentScreen } from '@/components/screens/employment-screen';
import { CodingScreen } from '@/components/screens/coding-screen';
import { MediaScreen } from '@/components/screens/media-screen';
import { StudyScreen } from '@/components/screens/study-screen';
import { UsersConsentScreen } from '@/components/screens/users-consent-screen';
import { SettingsScreen } from '@/components/screens/settings-screen';
import { TestSuiteModal } from '@/components/screens/test-suite-modal';

export default function HomePage() {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTestSuiteOpen, setIsTestSuiteOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Sidebar Navigation */}
      <Sidebar
        currentScreen={currentScreen}
        onSelectScreen={(screen) => setCurrentScreen(screen)}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <Topbar
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          onOpenSimulator={() => setCurrentScreen('simulator')}
          onOpenTestSuite={() => setIsTestSuiteOpen(true)}
        />

        {/* Dynamic Screen View */}
        <main className="flex-1 overflow-y-auto">
          {currentScreen === 'overview' && (
            <OverviewDashboard onNavigate={(screen) => setCurrentScreen(screen as ScreenId)} />
          )}
          {currentScreen === 'simulator' && <SimulatorScreen />}
          {currentScreen === 'conversations' && <ConversationsScreen />}
          {currentScreen === 'agents' && <AgentsScreen />}
          {currentScreen === 'services' && <ServicesPricingScreen />}
          {currentScreen === 'road-safety' && <RoadSafetyAdminScreen />}
          {currentScreen === 'payments' && <PaymentsReviewScreen />}
          {currentScreen === 'access' && <AccessAuditScreen />}
          {currentScreen === 'jobs' && <JobsScreen />}
          {currentScreen === 'employment' && <EmploymentScreen />}
          {currentScreen === 'coding' && <CodingScreen />}
          {currentScreen === 'media' && <MediaScreen />}
          {currentScreen === 'study' && <StudyScreen />}
          {currentScreen === 'users' && <UsersConsentScreen />}
          {currentScreen === 'settings' && <SettingsScreen />}
        </main>
      </div>

      {/* Automated Test Suite Modal */}
      <TestSuiteModal
        isOpen={isTestSuiteOpen}
        onClose={() => setIsTestSuiteOpen(false)}
      />
    </div>
  );
}
