'use client';

import Link from 'next/link';
import {
  Dumbbell, UtensilsCrossed, TrendingUp, CalendarCheck,
  Flame, Trophy, ChevronRight, Check, Zap, BarChart2,
  Smartphone, ShieldCheck, ArrowRight,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-paper/90 backdrop-blur border-b border-hairline px-5 py-3.5 flex items-center justify-between max-w-4xl mx-auto w-full">
        <span className="font-sans text-2xl font-black text-ink tracking-tight">FitTrack</span>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm text-ink-3 hover:text-ink transition-colors duration-150 cursor-pointer">Sign in</Link>
          <Link href="/sign-in" className="text-sm font-bold px-4 py-2 bg-clay hover:bg-clay-hover text-surface rounded-sm cursor-pointer transition-colors">
            Start Free
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-5">

        {/* ── Hero ── */}
        <section className="pt-16 pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-clay-wash border border-clay-dim text-clay text-xs font-bold mb-6">
            <Zap size={12} />
            Free forever to start · No download needed
          </div>
          <h1 className="font-sans text-5xl sm:text-6xl font-black leading-[1.05] mb-4">
            Stop Winging It.<br />
            <span className="text-clay">Follow a Plan That Works.</span>
          </h1>
          <p className="text-ink-2 text-lg leading-relaxed max-w-xl mx-auto mb-8">
            FitTrack gives you a structured strength program, automatic calorie targets,
            and daily tracking — all in one free app that lives on your phone.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/sign-in"
              className="flex items-center gap-2 px-7 py-4 bg-clay hover:bg-clay-hover text-surface font-bold rounded-card text-base cursor-pointer transition-colors w-full sm:w-auto justify-center">
              Start Your Free Program <ArrowRight size={18} />
            </Link>
            <span className="text-xs text-ink-3">No credit card · 2-minute setup</span>
          </div>
        </section>

        {/* ── App preview strip ── */}
        <section className="mb-14">
          <div className="bg-surface border border-hairline rounded-card p-5 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: <Dumbbell size={20} />, label: 'Workout Log',  val: '4 days/week'    },
                { icon: <UtensilsCrossed size={20} />, label: 'Nutrition', val: 'Auto TDEE'  },
                { icon: <TrendingUp size={20} />, label: 'Progress',   val: 'PRs + Charts'   },
                { icon: <CalendarCheck size={20} />, label: 'Streak',  val: 'Weekly check-in' },
              ].map(({ icon, label, val }) => (
                <div key={label} className="rounded-sm p-3.5 border border-hairline bg-surface-2 flex flex-col gap-2">
                  <div className="text-ink-2">{icon}</div>
                  <div className="font-mono tabular-nums text-lg font-semibold text-ink">{val}</div>
                  <div className="font-mono text-[11px] text-ink-3 uppercase font-bold tracking-wider">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="mb-14 text-center">
          <h2 className="font-sans text-3xl font-black mb-4">Most People Don't Have a Bad Work Ethic.<br />They Have No Plan.</h2>
          <p className="text-ink-2 text-base leading-relaxed max-w-lg mx-auto">
            You show up, do <em>something</em>, and three months later you're not sure if you're
            actually stronger or just tired. Random workouts don't compound. Random eating doesn't either.
            Without structure, you're leaving most of your results on the table.
          </p>
        </section>

        {/* ── Benefits bento ── */}
        <section className="mb-14">
          <h2 className="font-sans text-3xl font-black mb-6 text-center">Everything You Need. Nothing You Don't.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Big card */}
            <div className="sm:col-span-2 bg-surface border border-hairline rounded-card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 bg-clay-wash border border-clay-dim rounded-sm flex items-center justify-center text-clay flex-shrink-0">
                <Dumbbell size={24} />
              </div>
              <div>
                <div className="font-sans text-xl font-black mb-1">A Complete Program, Not a Blank Spreadsheet</div>
                <div className="text-ink-2 text-sm leading-relaxed">
                  Four structured gym days per week, automatically mapped to your schedule.
                  Every exercise includes sets, rep ranges, rest times, and a form cue.
                  You're told exactly when to add weight and when to back off.
                </div>
              </div>
            </div>

            {[
              { icon: <UtensilsCrossed size={20} />, title: 'Calories Calculated for You',   body: "Enter your weight and height. FitTrack sets your gym-day and rest-day calorie targets automatically using your TDEE. Adjust if you want — or leave it on auto." },
              { icon: <Trophy size={20} />,          title: 'PR Detection. Always.',          body: "Every set you log is checked against your history. Hit a new personal record and it's flagged instantly — with a running table in your Progress tab." },
              { icon: <BarChart2 size={20} />,       title: 'Track What Actually Matters',   body: "Log workouts, meals, weight, and body measurements in one place. Consistency score, streak tracking, and weekly summaries every Sunday." },
              { icon: <Smartphone size={20} />,      title: 'Lives on Your Home Screen',     body: "FitTrack is a PWA. Add it to your home screen in one tap. Works offline. No app store, no subscriptions to start." },
            ].map(({ icon, title, body }) => (
              <div key={title} className="bg-surface border border-hairline rounded-card p-5">
                <div className="w-10 h-10 bg-surface-2 border border-hairline rounded-sm flex items-center justify-center text-ink-2 mb-3">
                  {icon}
                </div>
                <div className="font-sans text-lg font-black mb-1">{title}</div>
                <div className="text-ink-2 text-sm leading-relaxed">{body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Phases ── */}
        <section className="mb-14">
          <h2 className="font-sans text-3xl font-black mb-2 text-center">4 Phases. One Continuous Build.</h2>
          <p className="text-ink-2 text-sm text-center mb-7">Each phase shifts focus as your body adapts. You get coaching cues every week.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { phase:'Foundation', weeks:'Wks 1–4',   icon:'🏗', desc:'Form over load. Film your big lifts.' },
              { phase:'Build',      weeks:'Wks 5–8',   icon:'📈', desc:'Progressive overload kicks in. Add 2.5 kg.' },
              { phase:'Strength',   weeks:'Wks 9–12',  icon:'💪', desc:'RPE 8–9. Push compounds. PRs should peak.' },
              { phase:'Peak',       weeks:'Wks 13–16', icon:'🏆', desc:'Deload, then peak intensity. Leave it all.' },
            ].map(({ phase, weeks, icon, desc }) => (
              <div key={phase} className="rounded-card p-4 border border-hairline bg-surface">
                <div className="text-2xl mb-2">{icon}</div>
                <div className="font-sans text-base font-black text-ink">{phase}</div>
                <div className="font-mono text-[10px] text-ink-3 uppercase font-bold tracking-wider mb-2">{weeks}</div>
                <div className="text-xs text-ink-2 leading-snug">{desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-ink-3 mt-4">Choose 8, 10, 12, 16, or 20 weeks — phases always scale to your length.</p>
        </section>

        {/* ── What you get ── */}
        <section className="mb-14 bg-surface border border-hairline rounded-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <ShieldCheck size={20} className="text-clay" />
            <h2 className="font-sans text-2xl font-black">Everything Free to Start</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              '16-week structured program (4 days/week)',
              'Auto TDEE calorie + protein targets',
              'Daily workout, meal & weight logging',
              'PR detection and consistency tracking',
              'Body measurements with progress chart',
              'Streak tracking & weekly check-ins',
              'Coach notes pad (per week)',
              'PWA — offline, any device',
              'Progress photo timeline',
              'Shareable weekly stats card',
            ].map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-ink-2">
                <Check size={15} className="text-sage flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* ── Objections ── */}
        <section className="mb-14">
          <h2 className="font-sans text-3xl font-black mb-5 text-center">Common Questions</h2>
          <div className="space-y-3">
            {[
              {
                q: "I'm not sure 16 weeks is right for me.",
                a: "You pick the length — 8 weeks if you want to start small, up to 20 if you're planning ahead. You can also set a past start date to pick up mid-program.",
              },
              {
                q: 'I already use MyFitnessPal / a spreadsheet.',
                a: 'FitTrack connects your workouts, nutrition, measurements, and progress in one place — tied to a structured program with a defined endpoint. Fewer tabs, more signal.',
              },
              {
                q: 'Is it actually free?',
                a: 'Yes. Sign up with Google or email, setup takes under 2 minutes, no credit card. A Pro tier is coming — early users get grandfathered in.',
              },
              {
                q: 'Do I need any gym experience?',
                a: 'No. Every exercise has a form cue and recommended starting weight. The Foundation phase is specifically designed to build the habit and technique before adding load.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-surface border border-hairline rounded-card overflow-hidden cursor-pointer">
                <summary className="flex items-center justify-between p-4 font-semibold text-sm list-none cursor-pointer select-none">
                  {q}
                  <ChevronRight size={16} className="text-ink-3 transition-transform duration-150 group-open:rotate-90 flex-shrink-0 ml-3" />
                </summary>
                <div className="px-4 pb-4 text-sm text-ink-2 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mb-20 text-center">
          <div className="bg-surface border border-hairline rounded-card p-8">
            <div className="flex justify-center gap-3 mb-4">
              <Flame size={28} className="text-clay" />
              <Trophy size={28} className="text-ink-2" />
            </div>
            <h2 className="font-sans text-4xl font-black mb-3">
              16 Weeks from Now,<br />
              <span className="text-clay">You'll Know Exactly Where You Stand.</span>
            </h2>
            <p className="text-ink-2 text-sm mb-6 max-w-sm mx-auto">
              Setup takes 2 minutes. No gym knowledge required. No credit card.
            </p>
            <Link href="/sign-in"
              className="inline-flex items-center gap-2 px-8 py-4 bg-clay hover:bg-clay-hover text-surface font-bold rounded-card text-base cursor-pointer transition-colors">
              Start Your Free Program <ArrowRight size={18} />
            </Link>
            <p className="text-xs text-ink-3 mt-3">Works on iPhone and Android · Offline-ready PWA</p>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-hairline py-6 text-center text-xs text-ink-3">
        <span className="font-sans font-bold text-ink-2">FitTrack</span> · Free strength program tracker · Built for people who show up
      </footer>

    </div>
  );
}
