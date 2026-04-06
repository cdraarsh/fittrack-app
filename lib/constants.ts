import type { WorkoutTemplate, ExerciseTemplate } from './types';

export const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export const DEFAULT_GYM_DAYS = ['monday','tuesday','wednesday','thursday'];

export const WORKOUTS: Record<string, WorkoutTemplate> = {
  monday: {
    day: 'Monday', name: 'Upper A — Push Focus',
    exercises: [
      { id:'bench',    name:'Flat Barbell Bench Press',  sets:3, lo:8,  hi:10, rest:'90s',  cue:'Start 40 kg. Add 2.5 kg when you hit 3×10.',  load:40 },
      { id:'shoulder', name:'Seated DB Shoulder Press',  sets:3, lo:10, hi:12, rest:'75s',  cue:'Start 10 kg DBs.',                            load:10 },
      { id:'cablerow', name:'Cable Row (wide grip)',      sets:3, lo:10, hi:12, rest:'75s',  cue:'Stack position you can control for all 12.',  load:null },
      { id:'latpull',  name:'Lat Pulldown',               sets:3, lo:10, hi:12, rest:'75s',  cue:'Squeeze lats hard at bottom.',                load:null },
      { id:'tricep',   name:'Tricep Rope Pushdown',       sets:2, lo:12, hi:15, rest:'60s',  cue:'Light weight, full range of motion.',         load:null },
      { id:'bicep',    name:'DB Bicep Curl',              sets:2, lo:12, hi:15, rest:'60s',  cue:'8 kg DBs, no swinging.',                      load:8 },
    ],
    cardio: 'Incline Treadmill Walk (10–12% grade, 5.5 kph) — 15 min',
  },
  tuesday: {
    day: 'Tuesday', name: 'Lower A — Quad Focus',
    exercises: [
      { id:'squat',   name:'Barbell Back Squat',   sets:3, lo:8,  hi:10, rest:'120s', cue:'Start 40 kg. Depth > weight. Film your sets.', load:40 },
      { id:'legprss', name:'Leg Press',             sets:3, lo:10, hi:12, rest:'90s',  cue:'Start ~100 kg on sled. Full range.',           load:100 },
      { id:'rdl',     name:'Romanian Deadlift',     sets:3, lo:10, hi:12, rest:'90s',  cue:'Start 30 kg BB. Feel hamstring stretch.',      load:30 },
      { id:'legcurl', name:'Leg Curl (machine)',    sets:3, lo:12, hi:15, rest:'60s',  cue:'Controlled eccentric — 3 sec lowering.',       load:null },
      { id:'calf',    name:'Standing Calf Raise',   sets:3, lo:15, hi:20, rest:'45s',  cue:'Pause 2 sec at top of each rep.',              load:null },
      { id:'plank',   name:'Plank',                 sets:3, lo:30, hi:45, rest:'45s',  cue:'Squeeze glutes, brace abs. (seconds)',         load:null, isTime:true },
    ],
    cardio: 'Stationary Bike (moderate pace) — 15 min',
  },
  wednesday: {
    day: 'Wednesday', name: 'Upper B — Pull Focus',
    exercises: [
      { id:'bentrow',  name:'Barbell Bent-Over Row',     sets:3, lo:8,  hi:10, rest:'90s',  cue:'Start 35 kg. Chest to bar, no heaving.',      load:35 },
      { id:'incline',  name:'Incline DB Bench Press',    sets:3, lo:10, hi:12, rest:'75s',  cue:'Start 12 kg DBs.',                            load:12 },
      { id:'facepull', name:'Seated Cable Face Pull',    sets:3, lo:12, hi:15, rest:'60s',  cue:'Light. External rotate at end of each rep.',  load:null },
      { id:'lateral',  name:'Lateral Raise (DB)',        sets:3, lo:12, hi:15, rest:'60s',  cue:'5–6 kg. Lead with pinky.',                    load:6 },
      { id:'ohtri',    name:'Overhead Tricep Extension', sets:2, lo:12, hi:15, rest:'60s',  cue:'Stretch fully at bottom.',                    load:null },
      { id:'hammer',   name:'Hammer Curl',               sets:2, lo:12, hi:15, rest:'60s',  cue:'8 kg DBs.',                                   load:8 },
    ],
    cardio: 'Incline Treadmill Walk — 15 min',
  },
  thursday: {
    day: 'Thursday', name: 'Lower B — Hinge Focus',
    exercises: [
      { id:'deadlift',  name:'Deadlift (Trap Bar / Conv.)',       sets:3, lo:6,  hi:8,  rest:'120s', cue:'Start 50 kg. Brace hard, flat back.', load:50 },
      { id:'bss',       name:'Bulgarian Split Squat',             sets:3, lo:10, hi:10, rest:'75s',  cue:'Start BW or 8 kg DBs. Per leg.',      load:0 },
      { id:'hipthru',   name:'Hip Thrust',                        sets:3, lo:10, hi:12, rest:'75s',  cue:'Start 40 kg. Squeeze glutes 2 sec.',  load:40 },
      { id:'legext',    name:'Leg Extension',                     sets:3, lo:12, hi:15, rest:'60s',  cue:'Controlled, squeeze at top.',         load:null },
      { id:'kneeraise', name:'Hanging Knee Raise / Cable Crunch', sets:3, lo:12, hi:15, rest:'45s',  cue:'Slow and controlled.',                load:null },
    ],
    cardio: 'Stationary Bike — 15 min',
  },
};

export const SWAP_MAP: Record<string, string[]> = {
  bench:    ['DB Bench Press','Smith Machine Press','Weighted Push-Up'],
  shoulder: ['Standing DB Press','Machine Shoulder Press','Arnold Press'],
  cablerow: ['T-Bar Row','Chest-Supported Row','Single-Arm DB Row'],
  latpull:  ['Assisted Pull-Up','Neutral Grip Pulldown','Straight-Arm Pulldown'],
  tricep:   ['Tricep Bar Pushdown','Overhead DB Extension','Dips (BW)'],
  bicep:    ['Barbell Curl','Cable Curl','Concentration Curl'],
  squat:    ['Goblet Squat','Hack Squat Machine','Safety Bar Squat'],
  legprss:  ['Hack Squat Machine','Bulgarian Split Squat','Step-Up (DB)'],
  rdl:      ['Single-Leg RDL (DB)','Good Morning','Cable Pull-Through'],
  legcurl:  ['Nordic Curl','Single-Leg Curl','Swiss Ball Curl'],
  calf:     ['Seated Calf Raise','Donkey Calf Raise','Calf Press (Leg Press)'],
  plank:    ['Dead Bug','RKC Plank','Ab Wheel Rollout'],
  bentrow:  ['T-Bar Row','Cable Row (underhand)','Pendlay Row'],
  incline:  ['Incline Barbell Press','Cable Fly (high)','Pec Deck'],
  facepull: ['Band Pull-Apart','Reverse Fly (DB)','Cable External Rotation'],
  lateral:  ['Cable Lateral Raise','Machine Lateral Raise','Upright Row'],
  ohtri:    ['Skull Crusher','Tricep Pushdown (bar)','Close-Grip Bench Press'],
  hammer:   ['Cross-Body Curl','Cable Hammer Curl','Zottman Curl'],
  deadlift: ['Sumo Deadlift','Trap Bar Deadlift','Romanian Deadlift (primary)'],
  bss:      ['Reverse Lunge (DB)','Step-Up (DB)','Single-Leg Press'],
  hipthru:  ['Glute Bridge (floor)','Cable Pull-Through','Banded Hip Thrust'],
  legext:   ['Terminal Knee Extension','VMO Squat','Sissy Squat'],
  kneeraise:['Cable Crunch','Decline Sit-Up','L-Sit Hold'],
};

export interface PhaseInfo {
  weeks: string;
  phase: string;
  icon: string;
  desc: string;
}

export const PHASE_INFO: (PhaseInfo | null)[] = [
  null,
  { weeks:'1–4',  phase:'Foundation Phase', icon:'🏗️', desc:'Prioritise form over load. Film your squat and deadlift every session.' },
  { weeks:'1–4',  phase:'Foundation Phase', icon:'🏗️', desc:'Prioritise form over load. Film your squat and deadlift every session.' },
  { weeks:'1–4',  phase:'Foundation Phase', icon:'🏗️', desc:'Prioritise form over load. Film your squat and deadlift every session.' },
  { weeks:'1–4',  phase:'Foundation Phase', icon:'🏗️', desc:'Prioritise form over load. Film your squat and deadlift every session.' },
  { weeks:'5–8',  phase:'Build Phase',      icon:'📈', desc:'Start progressive overload. Add 2.5 kg when you hit the top of your rep range.' },
  { weeks:'5–8',  phase:'Build Phase',      icon:'📈', desc:'Start progressive overload. Add 2.5 kg when you hit the top of your rep range.' },
  { weeks:'5–8',  phase:'Build Phase',      icon:'📈', desc:'Start progressive overload. Add 2.5 kg when you hit the top of your rep range.' },
  { weeks:'5–8',  phase:'Build Phase',      icon:'📈', desc:'Start progressive overload. Add 2.5 kg when you hit the top of your rep range.' },
  { weeks:'9–12', phase:'Strength Phase',   icon:'💪', desc:'Push RPE 8–9 on compounds. Track your PRs — this is where numbers should peak.' },
  { weeks:'9–12', phase:'Strength Phase',   icon:'💪', desc:'Push RPE 8–9 on compounds. Track your PRs — this is where numbers should peak.' },
  { weeks:'9–12', phase:'Strength Phase',   icon:'💪', desc:'Push RPE 8–9 on compounds. Track your PRs — this is where numbers should peak.' },
  { weeks:'9–12', phase:'Strength Phase',   icon:'💪', desc:'Push RPE 8–9 on compounds. Track your PRs — this is where numbers should peak.' },
  { weeks:'13–16',phase:'Peak Phase',       icon:'🏆', desc:'Peak intensity. Planned deload in week 15. Push hard on week 16.' },
  { weeks:'13–16',phase:'Peak Phase',       icon:'🏆', desc:'Deload week — drop loads by 40%, same reps. Let your body recover.' },
  { weeks:'13–16',phase:'Peak Phase',       icon:'🏆', desc:'Final week. Leave everything on the floor. 16 weeks of work behind you.' },
  { weeks:'13–16',phase:'Peak Phase',       icon:'🏆', desc:'Final week. Leave everything on the floor. 16 weeks of work behind you.' },
];
