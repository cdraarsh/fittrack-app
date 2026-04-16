'use client';

import { useState } from 'react';
import { useApp } from '@/lib/store';
import { DAYS, DEFAULT_GYM_DAYS } from '@/lib/constants';
import { computeTargetsFromTDEE, dk } from '@/lib/utils';
import { toast } from '../shared/Toast';
import { generateAIPlan } from '@/lib/aiPlan';
import type { UserProfile, OnboardingProfile, AIPlan } from '@/lib/types';

type Mode = 'auto' | 'manual';
type Goal = UserProfile['goal'];
type Activity = UserProfile['activity_outside_gym'];
type Experience = UserProfile['experience'];
type DietStyle = UserProfile['diet_style'];

const TOTAL_STEPS = 6;

export default function OnboardingWizard() {
  const { saveSettings, saveWeightLog, getWeightLog } = useApp();
  const [step, setStep] = useState(1);

  // Step 1 — basic info
  const [name,   setName]   = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  // Step 2 — goals
  const [age,          setAge]          = useState('');
  const [gender,       setGender]       = useState<'male' | 'female' | 'other'>('male');
  const [goal,         setGoal]         = useState<Goal>('weight_loss');
  const [targetWeight, setTargetWeight] = useState('');

  // Step 3 — lifestyle
  const [activity,      setActivity]      = useState<Activity>('sedentary');
  const [experience,    setExperience]    = useState<Experience>('beginner');
  const [dietStyle,     setDietStyle]     = useState<DietStyle>('no_restriction');
  const [foodsToAvoid,  setFoodsToAvoid]  = useState('');
  const [equipment,     setEquipment]     = useState<UserProfile['equipment']>('full_gym');

  // Step 4 — schedule
  const [start,        setStart]        = useState(dk(new Date()));
  const [programWeeks, setProgramWeeks] = useState(16);

  // Step 5 — gym days
  const [gymDays, setGymDays] = useState<string[]>(DEFAULT_GYM_DAYS);

  // Step 6 — AI generation state
  const [aiError, setAiError] = useState('');
  const [aiPartial, setAiPartial] = useState<Partial<AIPlan> | null>(null);

  // Step 4 calorie override (manual mode)
  const [mode,     setMode]     = useState<Mode>('auto');
  const [calsGym,  setCalsGym]  = useState('');
  const [calsRest, setCalsRest] = useState('');
  const [protein,  setProtein]  = useState('');

  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  function toggleDay(day: string) {
    setGymDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  // ── Validation + navigation ──

  function next1() {
    if (!weight || +weight < 30) { toast('Enter a valid weight'); return; }
    if (!height || +height < 100) { toast('Enter a valid height'); return; }
    const t = computeTargetsFromTDEE(+weight, +height);
    setCalsGym(String(t.cals_gym));
    setCalsRest(String(t.cals_rest));
    setProtein(String(t.protein));
    setStep(2);
  }

  function next2() {
    if (!age || +age < 10 || +age > 100) { toast('Enter a valid age'); return; }
    if (!targetWeight || +targetWeight < 30) { toast('Enter a target weight'); return; }
    setStep(3);
  }

  function next3() { setStep(4); }

  function next4() {
    if (!start) { toast('Pick a start date'); return; }
    setStep(5);
  }

  function next5() {
    if (gymDays.length === 0) { toast('Select at least 1 day'); return; }
    setStep(6);
    void runAIGeneration();
  }

  // ── AI plan generation ──

  async function runAIGeneration() {
    setAiError('');
    setAiPartial(null);
    try {
      const profile: OnboardingProfile = {
        name,
        age: +age,
        gender,
        weight_kg: +weight,
        height_cm: +height,
        target_weight_kg: +targetWeight,
        goal,
        activity_outside_gym: activity,
        experience,
        diet_style: dietStyle,
        foods_to_avoid: foodsToAvoid,
        equipment,
        gym_days_per_week: gymDays.length,
        gym_days: gymDays,
        program_weeks: programWeeks,
      };

      const aiPlan = await generateAIPlan(profile, setAiPartial);

      // Use AI-generated targets (override TDEE estimate)
      const finalGym  = aiPlan.daily_targets.gym_day_calories;
      const finalRest = aiPlan.daily_targets.rest_day_calories;
      const finalProt = aiPlan.daily_targets.protein_g;
      const t = computeTargetsFromTDEE(+weight, +height);

      const userProfile: UserProfile = {
        age: +age, gender, target_weight_kg: +targetWeight,
        goal, activity_outside_gym: activity, experience,
        diet_style: dietStyle, foods_to_avoid: foodsToAvoid,
        equipment,
      };

      await saveSettings({
        name,
        weight_start: +weight,
        height: +height,
        startDate: start,
        gymDays,
        cals_gym:  finalGym,
        cals_rest: finalRest,
        protein:   finalProt,
        fat:       aiPlan.daily_targets.fat_g || t.fat,
        onboarded: true,
        plan: 'free',
        programWeeks,
        aiPlan,
        userProfile,
      });

      const log = getWeightLog();
      if (log.length === 0) await saveWeightLog([{ date: start, weight: +weight }]);

      toast(`Plan ready${name ? `, ${name}` : ''}! Let's go.`);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  async function skipAI() {
    const t = computeTargetsFromTDEE(+weight, +height);
    const finalGym  = mode === 'auto' ? t.cals_gym  : (parseInt(calsGym)  || t.cals_gym);
    const finalRest = mode === 'auto' ? t.cals_rest : (parseInt(calsRest) || t.cals_rest);
    const finalProt = mode === 'auto' ? t.protein   : (parseInt(protein)  || t.protein);

    const userProfile: UserProfile = {
      age: +age, gender, target_weight_kg: +targetWeight,
      goal, activity_outside_gym: activity, experience,
      diet_style: dietStyle, foods_to_avoid: foodsToAvoid,
      equipment,
    };

    await saveSettings({
      name, weight_start: +weight, height: +height, startDate: start, gymDays,
      cals_gym: finalGym, cals_rest: finalRest, protein: finalProt, fat: t.fat,
      onboarded: true, plan: 'free', programWeeks, userProfile,
    });

    const log = getWeightLog();
    if (log.length === 0) await saveWeightLog([{ date: start, weight: +weight }]);
    toast(`Welcome${name ? ', ' + name : ''}!`);
  }

  const tdee = weight && height ? computeTargetsFromTDEE(+weight, +height) : null;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-5">
      <div className="w-full max-w-[420px] bg-bg1 border border-border rounded-[20px] p-7 shadow-2xl">

        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
            <div key={n} className={`h-1 rounded-full flex-1 transition-all ${
              n < step ? 'bg-accent/40' : n === step ? 'bg-accent' : 'bg-bg3 border border-border'
            }`} />
          ))}
        </div>

        {/* ── Step 1: Basic info ── */}
        {step === 1 && (
          <>
            <div className="font-condensed text-3xl font-black gradient-text mb-1">Welcome to FitTrack</div>
            <div className="text-sm text-text3 mb-6">Quick setup — takes 2 minutes.</div>
            <Field label="Your name" value={name} onChange={setName} placeholder="e.g. Aarsh" />
            <Field label="Bodyweight (kg)" value={weight} onChange={setWeight} placeholder="e.g. 104" type="number" />
            <Field label="Height (cm)" value={height} onChange={setHeight} placeholder="e.g. 175" type="number" />
            <Btn onClick={next1}>Next →</Btn>
          </>
        )}

        {/* ── Step 2: Goals ── */}
        {step === 2 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Your Goal</div>
            <div className="text-sm text-text3 mb-5">This shapes your entire plan.</div>

            <Field label="Age" value={age} onChange={setAge} placeholder="e.g. 24" type="number" />

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Gender</div>
              <div className="flex gap-1.5">
                {(['male', 'female', 'other'] as const).map(g => (
                  <button key={g} onClick={() => setGender(g)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border capitalize transition-all ${
                      gender === g ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Primary Goal</div>
              <div className="flex flex-col gap-1.5">
                {([
                  ['weight_loss', 'Lose Fat', 'Cut body fat while keeping muscle'],
                  ['muscle_gain', 'Build Muscle', 'Lean bulk with minimal fat gain'],
                  ['recomp',      'Recomposition', 'Lose fat and gain muscle simultaneously'],
                ] as const).map(([val, label, desc]) => (
                  <button key={val} onClick={() => setGoal(val)}
                    className={`w-full py-3 px-4 rounded-xl text-left border transition-all ${
                      goal === val ? 'bg-accent/10 border-accent/35' : 'bg-bg3 border-border'
                    }`}>
                    <div className={`text-sm font-bold ${goal === val ? 'text-accent' : 'text-text2'}`}>{label}</div>
                    <div className="text-[10px] text-text3 mt-0.5">{desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={goal === 'muscle_gain' ? 'Target weight (kg)' : 'Goal weight (kg)'}
              value={targetWeight}
              onChange={setTargetWeight}
              placeholder={goal === 'weight_loss' ? 'e.g. 80' : 'e.g. 90'}
              type="number"
            />

            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(1)}>← Back</Btn>
              <Btn onClick={next2}>Next →</Btn>
            </div>
          </>
        )}

        {/* ── Step 3: Lifestyle ── */}
        {step === 3 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Your Lifestyle</div>
            <div className="text-sm text-text3 mb-5">Used to calculate your exact calorie needs.</div>

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Activity outside gym</div>
              <div className="flex flex-col gap-1.5">
                {([
                  ['sedentary', 'Sedentary', 'Desk job, mostly sitting'],
                  ['light',     'Light',     'Some walking, standing job'],
                  ['moderate',  'Moderate',  'Physical job or daily walks'],
                  ['active',    'Very Active','Physical job + lots of movement'],
                ] as const).map(([val, label, desc]) => (
                  <button key={val} onClick={() => setActivity(val)}
                    className={`w-full py-2.5 px-4 rounded-xl text-left border transition-all ${
                      activity === val ? 'bg-accent/10 border-accent/35' : 'bg-bg3 border-border'
                    }`}>
                    <span className={`text-sm font-bold ${activity === val ? 'text-accent' : 'text-text2'}`}>{label}</span>
                    <span className="text-[10px] text-text3 ml-2">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Training Experience</div>
              <div className="flex gap-1.5">
                {([
                  ['beginner',     'Beginner',     '< 1 year'],
                  ['intermediate', 'Intermediate', '1–3 years'],
                  ['advanced',     'Advanced',     '3+ years'],
                ] as const).map(([val, label, sub]) => (
                  <button key={val} onClick={() => setExperience(val)}
                    className={`flex-1 py-2.5 rounded-xl text-center border transition-all ${
                      experience === val ? 'bg-accent/10 border-accent/35' : 'bg-bg3 border-border'
                    }`}>
                    <div className={`text-xs font-bold ${experience === val ? 'text-accent' : 'text-text2'}`}>{label}</div>
                    <div className="text-[9px] text-text3 mt-0.5">{sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Diet Style</div>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['no_restriction', 'Everything'],
                  ['vegetarian',     'Vegetarian'],
                  ['vegan',          'Vegan'],
                  ['keto',           'Keto'],
                  ['high_protein',   'High Protein'],
                ] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setDietStyle(val)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                      dietStyle === val ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">Equipment Available</div>
              <div className="flex flex-col gap-1.5">
                {([
                  ['full_gym',        'Full Gym',          'Barbells, cables, machines'],
                  ['dumbbells_only',   'Dumbbells Only',    'Dumbbells + bench'],
                  ['home_barbell',     'Home Barbell',      'Barbell + rack at home'],
                  ['bodyweight_only',  'Bodyweight Only',   'No equipment'],
                ] as const).map(([val, label, desc]) => (
                  <button key={val} onClick={() => setEquipment(val)}
                    className={`w-full py-2.5 px-4 rounded-xl text-left border transition-all ${
                      equipment === val ? 'bg-accent/10 border-accent/35' : 'bg-bg3 border-border'
                    }`}>
                    <span className={`text-sm font-bold ${equipment === val ? 'text-accent' : 'text-text2'}`}>{label}</span>
                    <span className="text-[10px] text-text3 ml-2">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Foods to avoid (optional)"
              value={foodsToAvoid}
              onChange={setFoodsToAvoid}
              placeholder="e.g. dairy, peanuts, shellfish"
            />

            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(2)}>← Back</Btn>
              <Btn onClick={next3}>Next →</Btn>
            </div>
          </>
        )}

        {/* ── Step 4: Schedule ── */}
        {step === 4 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Program Schedule</div>
            <div className="text-sm text-text3 mb-6">When does your program start?</div>
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
              <Btn secondary onClick={() => setStep(3)}>← Back</Btn>
              <Btn onClick={next4}>Next →</Btn>
            </div>
          </>
        )}

        {/* ── Step 5: Gym days ── */}
        {step === 5 && (
          <>
            <div className="font-condensed text-2xl font-black mb-1">Gym Days</div>
            <div className="text-sm text-text3 mb-5">Which days do you train?</div>
            <div className="grid grid-cols-7 gap-1.5 mb-6">
              {DAYS.map((day, i) => (
                <button key={day} onClick={() => toggleDay(day)}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase border transition-all ${
                    gymDays.includes(day) ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                  }`}>
                  {dayLabels[i]}
                </button>
              ))}
            </div>
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-3.5 mb-5">
              <div className="text-xs font-bold text-accent mb-1">AI Plan Generation</div>
              <div className="text-[11px] text-text3 leading-relaxed">
                Next, Claude will analyse your profile and generate a personalised calorie target, macro split, and nutrition plan tailored to your {goal.replace('_', ' ')} goal.
              </div>
            </div>
            <div className="flex gap-2">
              <Btn secondary onClick={() => setStep(4)}>← Back</Btn>
              <Btn onClick={next5}>Generate My Plan →</Btn>
            </div>
          </>
        )}

        {/* ── Step 6: AI Generation ── */}
        {step === 6 && (
          <>
            {!aiError ? (
              <>
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center mb-5">
                    <Spinner />
                  </div>
                  <div className="font-condensed text-2xl font-black mb-2">Building Your Plan</div>
                  <div className="text-sm text-text3 mb-4">Claude is analysing your profile...</div>

                  {(() => {
                    const steps: Array<{ key: keyof AIPlan; label: string }> = [
                      { key: 'daily_targets', label: 'Calorie & macro targets' },
                      { key: 'cardio_recommendation', label: 'Cardio prescription' },
                      { key: 'nutrition_principles', label: 'Nutrition principles' },
                      { key: 'workout_plan', label: 'Workout plan' },
                      { key: 'phase_targets', label: 'Progression phases' },
                    ];
                    return (
                      <div className="w-full max-w-[280px] flex flex-col gap-1.5 text-left">
                        {steps.map(({ key, label }) => {
                          const done = Boolean(aiPartial?.[key]);
                          return (
                            <div key={key} className="flex items-center gap-2 text-[11px]">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black ${
                                done ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-bg3 text-text3/40 border border-border'
                              }`}>
                                {done ? '✓' : '·'}
                              </span>
                              <span className={done ? 'text-text' : 'text-text3/60'}>{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {aiPartial?.daily_targets?.gym_day_calories ? (
                    <div className="text-[11px] text-text3 mt-4">
                      TDEE ~{aiPartial.tdee_estimate ?? '—'} kcal · Gym day {aiPartial.daily_targets.gym_day_calories} kcal
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="font-condensed text-2xl font-black mb-2 text-red-400">Generation Failed</div>
                <div className="text-sm text-text3 mb-4 bg-bg2 border border-border rounded-xl p-3 text-[11px] leading-relaxed break-words">
                  {aiError}
                </div>
                {tdee && (
                  <>
                    <div className="text-xs text-text3 mb-3">
                      No problem — we'll use a TDEE estimate instead. You can update your targets in settings any time.
                    </div>
                    <div className="mb-4">
                      <div className="text-[10px] text-text3 uppercase font-bold mb-2 tracking-wider">Calorie Targets</div>
                      <div className="flex gap-2 mb-3">
                        {(['auto', 'manual'] as Mode[]).map(m => (
                          <button key={m} onClick={() => setMode(m)}
                            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                              mode === m ? 'bg-accent/10 border-accent/35 text-accent' : 'bg-bg3 border-border text-text3'
                            }`}>
                            {m === 'auto' ? 'Auto (TDEE)' : 'Manual'}
                          </button>
                        ))}
                      </div>
                      {mode === 'auto' ? (
                        <div className="bg-bg2 border border-border rounded-[10px] p-4 grid grid-cols-2 gap-2">
                          {([['Gym day', `${tdee.cals_gym} kcal`], ['Rest day', `${tdee.cals_rest} kcal`], ['Protein', `${tdee.protein}g`], ['Fat', `${tdee.fat}g`]] as const).map(([l, v]) => (
                            <div key={l} className="bg-bg3 rounded-lg p-2.5 text-center">
                              <div className="font-condensed text-xl font-black text-accent">{v}</div>
                              <div className="text-[10px] text-text3 uppercase font-bold mt-0.5">{l}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          <Field label="Gym day calories" value={calsGym} onChange={setCalsGym} type="number" />
                          <Field label="Rest day calories" value={calsRest} onChange={setCalsRest} type="number" />
                          <Field label="Protein (g)" value={protein} onChange={setProtein} type="number" />
                        </>
                      )}
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Btn secondary onClick={() => { setAiError(''); void runAIGeneration(); }}>Retry AI</Btn>
                  <Btn onClick={skipAI}>Skip → Use TDEE</Btn>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div className="mb-4">
      <div className="text-[10px] text-text3 uppercase font-bold mb-1.5 tracking-wider">{label}</div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-bg3 border border-border rounded-xl text-sm px-4 py-3 outline-none focus:border-accent text-text1"
      />
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

function Spinner() {
  return (
    <svg className="w-6 h-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
