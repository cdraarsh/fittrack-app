'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { DAYS, DEFAULT_GYM_DAYS } from '@/lib/constants';
import { computeTargetsFromTDEE, dk } from '@/lib/utils';
import { toast } from '../shared/Toast';

type Mode = 'auto' | 'manual';

export default function OnboardingWizard() {
  const { saveSettings, saveWeightLog, getWeightLog } = useApp();
  const [step,    setStep]    = useState(1);
  const [name,    setName]    = useState('');
  const [weight,  setWeight]  = useState('');
  const [height,  setHeight]  = useState('');
  const [start,   setStart]   = useState(dk(new Date()));
  const [gymDays, setGymDays] = useState<string[]>(DEFAULT_GYM_DAYS);
  const [mode,         setMode]         = useState<Mode>('auto');
  const [programWeeks, setProgramWeeks] = useState(16);
  const [calsGym,  setCalsGym]  = useState('');
  const [calsRest, setCalsRest] = useState('');
  const [protein,  setProtein]  = useState('');

  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const dots = [1,2,3,4];

  function toggleDay(day: string) {
    setGymDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  function next1() {
    if (!weight || +weight < 30) { toast('Enter a valid weight'); return; }
    if (!height || +height < 100) { toast('Enter a valid height'); return; }
    const t = computeTargetsFromTDEE(+weight, +height);
    setCalsGym(String(t.cals_gym)); setCalsRest(String(t.cals_rest)); setProtein(String(t.protein));
    setStep(2);
  }

  function next2() { if (!start) { toast('Pick a start date'); return; } setStep(3); }

  function next3() { if (gymDays.length === 0) { toast('Select at least 1 day'); return; } setStep(4); }

  async function complete() {
    const w = +weight; const h = +height;
    const t = computeTargetsFromTDEE(w, h);
    const finalGym  = mode === 'auto' ? t.cals_gym  : (parseInt(calsGym)  || t.cals_gym);
    const finalRest = mode === 'auto' ? t.cals_rest : (parseInt(calsRest) || t.cals_rest);
    const finalProt = mode === 'auto' ? t.protein   : (parseInt(protein)  || t.protein);

    await saveSettings({ name, weight_start: w, height: h, startDate: start, gymDays, cals_gym: finalGym, cals_rest: finalRest, protein: finalProt, fat: t.fat, onboarded: true, plan: 'free', programWeeks });
    const log = getWeightLog();
    if (log.length === 0) await saveWeightLog([{ date: start, weight: w }]);
    toast(`Welcome${name ? ', ' + name : ''}! Program starts ${start}.`);
  }

  const tdee = weight && height ? computeTargetsFromTDEE(+weight, +height) : null;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-5">
      <div className="w-full max-w-[420px] bg-bg1 border border-border rounded-[20px] p-7 shadow-2xl">

        {/* Step dots */}
        <div className="flex gap-1.5 mb-6">
          {dots.map(n => (
            <div key={n} className={`h-1 rounded-full flex-1 transition-all ${n < step ? 'bg-accent/40' : n === step ? 'bg-accent' : 'bg-bg3 border border-border'}`} />
          ))}
        </div>

        {step === 1 && (
          <>
            <div className="font-condensed text-3xl font-black gradient-text mb-1">Welcome to FitTrack</div>
            <div className="text-sm text-text3 mb-6">Quick setup — takes 1 minute.</div>
            <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Aarsh" />
            <Field label="Bodyweight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 82" type="number" />
            <Field label="Height (cm)" value={height} onChange={setHeight} placeholder="e.g. 175" type="number" />
            <Btn onClick={next1}>Next →</Btn>
          </>
        )}

        {step === 2 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Program Start</div>
            <div className="text-sm text-text3 mb-6">When did your 16-week program begin?</div>
            <Field label="Start date" value={start} onChange={setStart} type="date" />
            <div className="text-xs text-text3 -mt-2 mb-5">Set today if you're just starting. Set a past date to resume mid-program.</div>
            <div className="mb-5">
              <div className="text-[10px] text-text3 uppercase font-bold mb-2 tracking-wider">Program Length</div>
              <div className="flex gap-1.5">
                {[8, 10, 12, 16, 20].map(w => (
                  <button key={w} type="button" onClick={() => setProgramWeeks(w)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                      programWeeks === w ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                    }`}>
                    {w}w
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(1)}>← Back</Btn>
              <Btn onClick={next2}>Next →</Btn>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Gym Days</div>
            <div className="text-sm text-text3 mb-5">Which days do you train?</div>
            <div className="grid grid-cols-7 gap-1.5 mb-5">
              {DAYS.map((day, i) => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${
                    gymDays.includes(day) ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                  }`}>
                  {dayLabels[i]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(2)}>← Back</Btn>
              <Btn onClick={next3}>Next →</Btn>
            </div>
          </>
        )}

        {step === 4 && tdee && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Calorie Targets</div>
            <div className="text-sm text-text3 mb-4">Set your daily nutrition targets.</div>
            <div className="flex gap-2 mb-4">
              {(['auto','manual'] as Mode[]).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                    mode === m ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                  }`}>
                  {m === 'auto' ? 'Auto (TDEE)' : 'Manual'}
                </button>
              ))}
            </div>
            {mode === 'auto' ? (
              <div className="bg-bg2 border border-border rounded-[10px] p-4 mb-5 grid grid-cols-2 gap-2">
                {[['Gym day', `${tdee.cals_gym} kcal`],['Rest day',`${tdee.cals_rest} kcal`],['Protein',`${tdee.protein}g`],['Fat',`${tdee.fat}g`]].map(([l,v]) => (
                  <div key={l} className="bg-bg3 rounded-lg p-2.5 text-center">
                    <div className="font-condensed text-xl font-black text-accent">{v}</div>
                    <div className="text-[10px] text-text3 uppercase font-bold mt-0.5">{l}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-5">
                <Field label="Gym day calories" value={calsGym}  onChange={setCalsGym}  type="number" />
                <Field label="Rest day calories" value={calsRest} onChange={setCalsRest} type="number" />
                <Field label="Protein (g)"       value={protein}  onChange={setProtein}  type="number" />
              </div>
            )}
            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(3)}>← Back</Btn>
              <Btn onClick={complete}>Start Program →</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string; type?:string }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-bg3 border border-border rounded-xl text-sm px-4 py-3 outline-none focus:border-accent text-text1" />
    </div>
  );
}

function Btn({ children, onClick, secondary }: { children: React.ReactNode; onClick: () => void; secondary?: boolean }) {
  return (
    <button onClick={onClick} className={`flex-1 py-3.5 rounded-xl font-bold text-sm transition-all ${
      secondary
        ? 'bg-bg3 border border-border text-text2 flex-none px-5'
        : 'bg-gradient-to-r from-accent to-green-400 text-black'
    }`}>
      {children}
    </button>
  );
}
