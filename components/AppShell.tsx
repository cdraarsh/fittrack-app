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

const TABS: { id: TabName; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'today',     label: 'Today',    Icon: Zap },
  { id: 'workouts',  label: 'Train',    Icon: Dumbbell },
  { id: 'nutrition', label: 'Eat',      Icon: Apple },
  { id: 'progress',  label: 'Stats',    Icon: TrendingUp },
  { id: 'settings',  label: 'Settings', Icon: Settings2 },
];

export default function AppShell() {
  const { settings, isLoading, currentTab, setCurrentTab } = useApp();

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
  const isGymDay   = todayIsGymDay(settings);
  const weekNum    = getWeekNum(settings);
  const totalWeeks = getProgramWeeks(settings);

  return (
    <div className="max-w-app mx-auto min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="bg-bg1 border-b border-border px-5 py-3 sticky top-0 z-40">
        <div className="flex items-center justify-between mb-1">
          <h1
            className="font-condensed text-[28px] font-black tracking-tight"
            style={{
              background: 'linear-gradient(135deg,#22c55e,#4ade80)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            FitTrack
          </h1>
          <div className="flex items-center gap-3">
            <span className="font-sans text-xs font-bold px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">
              Week {weekNum}/{totalWeeks}
            </span>
            <UserButton appearance={{ variables: { colorPrimary: '#22c55e', colorBackground: '#0e1117', colorText: '#f1f5f9' } }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text2">
            {today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
          <span className={`font-sans text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            isGymDay
              ? 'bg-accent/10 text-accent border border-accent/20'
              : 'bg-bg2 text-text2 border border-border'
          }`}>
            {isGymDay ? 'Gym Day' : 'Rest Day'}
          </span>
          {settings.name && (
            <span className="text-xs text-text3 ml-auto">Hey, {settings.name}</span>
          )}
        </div>
      </header>

      {/* Tab content */}
      <main className="flex-1 p-4 pb-28">
        {currentTab === 'today'     && <TodayTab />}
        {currentTab === 'workouts'  && <WorkoutsTab />}
        {currentTab === 'nutrition' && <NutritionTab />}
        {currentTab === 'progress'  && <ProgressTab />}
        {currentTab === 'settings'  && <SettingsTab />}
      </main>

      <RestTimer />

      {/* Bottom tab nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 max-w-app w-full z-40"
        style={{ background: 'rgba(14,17,23,0.95)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex gap-1 px-2.5 pt-2 pb-5">
          {TABS.map(({ id, label, Icon }) => {
            const active = currentTab === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentTab(id)}
                className={`flex-1 min-h-12 py-1.5 px-1 rounded-sm cursor-pointer flex flex-col items-center justify-center gap-1 active:scale-95 transition-all duration-150 ${
                  active ? 'text-accent' : 'text-text3 hover:text-text2'
                }`}
              >
                <Icon size={20} className={active ? 'text-accent' : 'text-text3'} />
                <span className={`text-[10px] font-semibold ${active ? 'text-accent' : 'text-text3'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
