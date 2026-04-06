'use client';

import React, { useEffect } from 'react';
import { UserButton } from '@clerk/nextjs';
import { Settings2 } from 'lucide-react';
import { useApp } from '@/lib/store';
import { getWeekNum, todayIsGymDay, getProgramWeeks } from '@/lib/utils';
import { DAYS } from '@/lib/constants';
import OnboardingWizard from './onboarding/OnboardingWizard';
import TodayTab      from './tabs/TodayTab';
import WorkoutsTab   from './tabs/WorkoutsTab';
import NutritionTab  from './tabs/NutritionTab';
import ProgressTab   from './tabs/ProgressTab';
import SettingsTab   from './tabs/SettingsTab';
import RestTimer     from './shared/RestTimer';
import type { TabName } from '@/lib/types';

const TABS: { id: TabName; label: string; icon?: React.ReactNode }[] = [
  { id: 'today',     label: 'Today'     },
  { id: 'workouts',  label: 'Workouts'  },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'progress',  label: 'Progress'  },
  { id: 'settings',  label: '', icon: <Settings2 size={16} /> },
];

export default function AppShell() {
  const { settings, isLoading, currentTab, setCurrentTab } = useApp();

  // Register PWA service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings?.onboarded) {
    return <OnboardingWizard />;
  }

  const today = new Date();
  const todayName = DAYS[today.getDay()];
  const isGymDay    = todayIsGymDay(settings);
  const weekNum     = getWeekNum(settings);
  const totalWeeks  = getProgramWeeks(settings);

  return (
    <div className="max-w-app mx-auto min-h-screen flex flex-col pb-20">
      {/* Header */}
      <header className="bg-bg1 border-b border-accent/10 px-5 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-condensed text-3xl font-black gradient-text tracking-tight">FitTrack</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
              Week {weekNum}/{totalWeeks}
            </span>
            <UserButton appearance={{ variables: { colorPrimary: '#22c55e', colorBackground: '#161b24', colorText: '#f1f5f9' } }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text2">
            {today.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider ${
            isGymDay ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-text3/10 text-text2 border border-border'
          }`}>
            {isGymDay ? 'Gym Day' : 'Rest Day'}
          </span>
          {settings.name && (
            <span className="text-xs text-text3 ml-auto">Hey, {settings.name}</span>
          )}
        </div>
      </header>

      {/* Tab nav */}
      <nav className="bg-bg1 border-b border-border sticky top-[69px] z-39 px-2.5 py-1.5 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setCurrentTab(t.id)}
            className={`flex-1 min-h-[44px] text-[13px] font-semibold py-2 px-1 rounded-lg transition-colors duration-150 cursor-pointer flex items-center justify-center ${
              t.id === 'settings' ? 'flex-none px-3' : ''
            } ${
              currentTab === t.id
                ? 'text-accent bg-accent/10'
                : 'text-text3 hover:text-text2 hover:bg-bg2'
            }`}
          >
            {t.icon ?? t.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main className="flex-1 p-4">
        {currentTab === 'today'     && <TodayTab />}
        {currentTab === 'workouts'  && <WorkoutsTab />}
        {currentTab === 'nutrition' && <NutritionTab />}
        {currentTab === 'progress'  && <ProgressTab />}
        {currentTab === 'settings'  && <SettingsTab />}
      </main>

      <RestTimer />
    </div>
  );
}
