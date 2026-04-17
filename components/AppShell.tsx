'use client';

import React, { useEffect } from 'react';
import { UserButton } from '@clerk/nextjs';
import { Settings2, Zap, Dumbbell, Apple, TrendingUp } from 'lucide-react';
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

const TABS: { id: TabName; label: string; icon: React.ReactNode }[] = [
  { id: 'today',     label: 'Today',    icon: <Zap size={16} /> },
  { id: 'workouts',  label: 'Train',    icon: <Dumbbell size={16} /> },
  { id: 'nutrition', label: 'Eat',      icon: <Apple size={16} /> },
  { id: 'progress',  label: 'Stats',    icon: <TrendingUp size={16} /> },
  { id: 'settings',  label: '',         icon: <Settings2 size={16} /> },
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
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-hairline border-t-clay rounded-full animate-spin" />
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
      <header className="bg-surface border-b border-hairline px-5 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-sans text-3xl font-black text-ink tracking-tight">FitTrack</h1>
          <div className="flex items-center gap-3">
            <span className="font-mono tabular-nums text-xs font-bold px-3 py-1 rounded-full bg-surface-2 text-ink-2 border border-hairline">
              Week {weekNum}/{totalWeeks}
            </span>
            <UserButton appearance={{ variables: { colorPrimary: '#B84B3A', colorBackground: '#FFFDF7', colorText: '#121110' } }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-2">
            {today.toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric' })}
          </span>
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider ${
            isGymDay ? 'bg-clay-wash text-clay border border-clay-dim' : 'bg-surface-2 text-ink-2 border border-hairline'
          }`}>
            {isGymDay ? 'Gym Day' : 'Rest Day'}
          </span>
          {settings.name && (
            <span className="text-xs text-ink-3 ml-auto">Hey, {settings.name}</span>
          )}
        </div>
      </header>

      {/* Tab nav */}
      <nav className="bg-surface border-b border-hairline sticky top-[69px] z-39 px-2.5 py-1.5 flex gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setCurrentTab(t.id)}
            className={`flex-1 min-h-[48px] py-1.5 px-1 rounded-sm transition-colors duration-150 cursor-pointer flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform ${
              t.id === 'settings' ? 'flex-none px-3' : ''
            } ${
              currentTab === t.id
                ? 'text-clay bg-clay-wash'
                : 'text-ink-3 hover:text-ink-2 hover:bg-surface-2'
            }`}
          >
            {t.icon}
            {t.label && <span className="text-[10px] font-semibold">{t.label}</span>}
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
