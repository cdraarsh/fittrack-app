'use client';

import Link from 'next/link';
import {
  Dumbbell, UtensilsCrossed, TrendingUp, CalendarCheck,
  Flame, Trophy, ChevronRight, Check, Zap, BarChart2,
  Smartphone, ShieldCheck, ArrowRight,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text1">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-bg/80 backdrop-blur border-b border-border px-5 py-3.5 flex items-center justify-between max-w-4xl mx-auto w-full">
        <span className="font-condensed text-2xl font-black gradient-text tracking-tight">FitTrack</span>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm text-text3 hover:text-text1 transition-colors duration-150 cursor-pointer">Sign in</Link>
          <Link href="/sign-in" className="text-sm font-bold px-4 py-2 bg-gradient-to-r from-accent to-green-400 text-black rounded-xl cursor-pointer transition-opacity hover:opacity-90">
            Start Free
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-5">

        {/* ── Hero ── */}
        <section className="pt-16 pb-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-bold mb-6">
            <Zap size={12} />
            Free forever to start · No download needed
          </div>
          <h1 className="font-condensed text-5xl sm:text-6xl font-black leading-[1.05] mb-4">
            Stop Winging It.<br />
            <span className="gradient-text">Follow a Plan That Works.</span>
          </h1>
          <p className="text-text2 text-lg leading-relaxed max-w-xl mx-auto mb-8">
            FitTrack gives you a structured strength program, automatic calorie targets,
            and daily tracking — all in one free app that lives on your phone.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/sign-in"
              className="flex items-center gap-2 px-7 py-4 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-2xl text-base cursor-pointer hover:opacity-90 transition-opacity w-full sm:w-auto justify-center">
              Start Your Free Program <ArrowRight size={18} />
            </Link>
            <span className="text-xs text-text3">No credit card · 2-minute setup</span>
          </div>
        </section>

        {/* ── App preview strip ── */}
        <section className="mb-14">
          <div className="bg-bg1 border border-border rounded-[20px] p-5 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: <Dumbbell size={20} />, label: 'Workout Log',    val: '4 days/week',       color: 'text-accent',  bg: 'bg-accent/10 border-accent/20'  },
                { icon: <UtensilsCrossed size={20} />, label: 'Nutrition', val: 'Auto TDEE',        color: 'text-warn',    bg: 'bg-warn/10 border-warn/20'      },
                { icon: <TrendingUp size={20} />, label: 'Progress',     val: 'PRs + Charts',      color: 'text-info',    bg: 'bg-info/10 border-info/20'      },
                { icon: <CalendarCheck size={20} />, label: 'Streak',    val: 'Weekly check-in',   color: 'text-purple',  bg: 'bg-purple/10 border-purple/20'  },
              ].map(({ icon, label, val, color, bg }) => (
                <div key={label} className={`rounded-[14px] p-3.5 border ${bg} flex flex-col gap-2`}>
                  <div className={`${color}`}>{icon}</div>
                  <div className="font-condensed text-lg font-black text-text1">{val}</div>
                  <div className="text-[11px] text-text3 uppercase font-bold tracking-wider">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="mb-14 text-center">
          <h2 className="font-condensed text-3xl font-black mb-4">Most People Don't Have a Bad Work Ethic.<br />They Have No Plan.</h2>
          <p className="text-text2 text-base leading-relaxed max-w-lg mx-auto">
            You show up, do <em>something</em>, and three months later you're not sure if you're
            actually stronger or just tired. Random workouts don't compound. Random eating doesn't either.
            Without structure, you're leaving most of your results on the table.
          </p>
        </section>

        {/* ── Benefits bento ── */}
        <section className="mb-14">
          <h2 className="font-condensed text-3xl font-black mb-6 text-center">Everything You Need. Nothing You Don't.</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* Big card */}
            <div className="sm:col-span-2 bg-bg1 border border-border rounded-[20px] p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-[14px] flex items-center justify-center text-accent flex-shrink-0">
                <Dumbbell size={24} />
              </div>
              <div>
                <div className="font-condensed text-xl font-black mb-1">A Complete Program, Not a Blank Spreadsheet</div>
                <div className="text-text2 text-sm leading-relaxed">
                  Four structured gym days per week, automatically mapped to your schedule.
                  Every exercise includes sets, rep ranges, rest times, and a form cue.
                  You're told exactly when to add weight and when to back off.
                </div>
              </div>
            </div>

            <div className="bg-bg1 border border-border rounded-[20px] p-5">
              <div className="w-10 h-10 bg-warn/10 border border-warn/20 rounded-[12px] flex items-center justify-center text-warn mb-3">
                <UtensilsCrossed size={20} />
              </div>
              <div className="font-condensed text-lg font-black mb-1">Calories Calculated for You</div>
              <div className="text-text2 text-sm leading-relaxed">Enter your weight and height. FitTrack sets your gym-day and rest-day calorie targets automatically using your TDEE. Adjust if you want — or leave it on auto.</div>
            </div>

            <div className="bg-bg1 border border-border rounded-[20px] p-5">
              <div className="w-10 h-10 bg-info/10 border border-info/20 rounded-[12px] flex items-center justify-center text-info mb-3">
                <Trophy size={20} />
              </div>
              <div className="font-condensed text-lg font-black mb-1">PR Detection. Always.</div>
              <div className="text-text2 text-sm leading-relaxed">Every set you log is checked against your history. Hit a new personal record and it's flagged instantly — with a running table in your Progress tab.</div>
            </div>

            <div className="bg-bg1 border border-border rounded-[20px] p-5">
              <div className="w-10 h-10 bg-purple/10 border border-purple/20 rounded-[12px] flex items-center justify-center text-purple mb-3">
                <BarChart2 size={20} />
              </div>
              <div className="font-condensed text-lg font-black mb-1">Track What Actually Matters</div>
              <div className="text-text2 text-sm leading-relaxed">Log workouts, meals, weight, and body measurements in one place. Consistency score, streak tracking, and weekly summaries every Sunday.</div>
            </div>

            <div className="bg-bg1 border border-border rounded-[20px] p-5">
              <div className="w-10 h-10 bg-accent/10 border border-accent/20 rounded-[12px] flex items-center justify-center text-accent mb-3">
                <Smartphone size={20} />
              </div>
              <div className="font-condensed text-lg font-black mb-1">Lives on Your Home Screen</div>
              <div className="text-text2 text-sm leading-relaxed">FitTrack is a PWA. Add it to your home screen in one tap. Works offline. No app store, no subscriptions to start.</div>
            </div>
          </div>
        </section>

        {/* ── Phases ── */}
        <section className="mb-14">
          <h2 className="font-condensed text-3xl font-black mb-2 text-center">4 Phases. One Continuous Build.</h2>
          <p className="text-text2 text-sm text-center mb-7">Each phase shifts focus as your body adapts. You get coaching cues every week.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { phase:'Foundation', weeks:'Wks 1–4',  icon:'🏗', color:'text-info',   bg:'bg-info/8 border-info/15',    desc:'Form over load. Film your big lifts.' },
              { phase:'Build',      weeks:'Wks 5–8',  icon:'📈', color:'text-accent', bg:'bg-accent/8 border-accent/15', desc:'Progressive overload kicks in. Add 2.5 kg.' },
              { phase:'Strength',   weeks:'Wks 9–12', icon:'💪', color:'text-warn',   bg:'bg-warn/8 border-warn/15',    desc:'RPE 8–9. Push compounds. PRs should peak.' },
              { phase:'Peak',       weeks:'Wks 13–16',icon:'🏆', color:'text-purple', bg:'bg-purple/8 border-purple/15',desc:'Deload, then peak intensity. Leave it all.' },
            ].map(({ phase, weeks, icon, color, bg, desc }) => (
              <div key={phase} className={`rounded-[16px] p-4 border ${bg}`}>
                <div className="text-2xl mb-2">{icon}</div>
                <div className={`font-condensed text-base font-black ${color}`}>{phase}</div>
                <div className="text-[10px] text-text3 uppercase font-bold tracking-wider mb-2">{weeks}</div>
                <div className="text-xs text-text2 leading-snug">{desc}</div>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-text3 mt-4">Choose 8, 10, 12, 16, or 20 weeks — phases always scale to your length.</p>
        </section>

        {/* ── What you get ── */}
        <section className="mb-14 bg-bg1 border border-border rounded-[20px] p-6">
          <div className="flex items-center gap-3 mb-5">
            <ShieldCheck size={20} className="text-accent" />
            <h2 className="font-condensed text-2xl font-black">Everything Free to Start</h2>
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
              <div key={item} className="flex items-center gap-2.5 text-sm text-text2">
                <Check size={15} className="text-accent flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* ── Objections ── */}
        <section className="mb-14">
          <h2 className="font-condensed text-3xl font-black mb-5 text-center">Common Questions</h2>
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
              <details key={q} className="group bg-bg1 border border-border rounded-[14px] overflow-hidden cursor-pointer">
                <summary className="flex items-center justify-between p-4 font-semibold text-sm list-none cursor-pointer select-none">
                  {q}
                  <ChevronRight size={16} className="text-text3 transition-transform duration-150 group-open:rotate-90 flex-shrink-0 ml-3" />
                </summary>
                <div className="px-4 pb-4 text-sm text-text2 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mb-20 text-center">
          <div className="bg-gradient-to-br from-accent/8 to-info/5 border border-accent/15 rounded-[24px] p-8">
            <div className="flex justify-center gap-3 mb-4">
              <Flame size={28} className="text-warn" />
              <Trophy size={28} className="text-accent" />
            </div>
            <h2 className="font-condensed text-4xl font-black mb-3">
              16 Weeks from Now,<br />
              <span className="gradient-text">You'll Know Exactly Where You Stand.</span>
            </h2>
            <p className="text-text2 text-sm mb-6 max-w-sm mx-auto">
              Setup takes 2 minutes. No gym knowledge required. No credit card.
            </p>
            <Link href="/sign-in"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-accent to-green-400 text-black font-bold rounded-2xl text-base cursor-pointer hover:opacity-90 transition-opacity">
              Start Your Free Program <ArrowRight size={18} />
            </Link>
            <p className="text-xs text-text3 mt-3">Works on iPhone and Android · Offline-ready PWA</p>
          </div>
        </section>

      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-6 text-center text-xs text-text3">
        <span className="font-condensed font-bold text-text2">FitTrack</span> · Free strength program tracker · Built for people who show up
      </footer>

    </div>
  );
}
