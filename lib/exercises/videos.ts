/**
 * Form / how-to videos for every library exercise (lib/exercises/seed.ts) and
 * every warm-up / cool-down item (lib/program/routines.ts), keyed by id.
 *
 * Every entry was found by search and verified with YouTube's oEmbed endpoint
 * (200 + matching title). Channel and title are copied from oEmbed. Re-verify
 * with `npx tsx scripts/check-videos.ts`. Ids left out on purpose (no verified
 * video) are listed in NO_VIDEO; the UI hides the video button for them.
 *
 * Nothing here loads YouTube: the player builds a nocookie embed only on tap.
 */
export interface ExerciseVideo {
  /** 11-character YouTube video id. */
  id: string;
  channel: string;
  title: string;
}

export const VIDEOS: Record<string, ExerciseVideo> = {
  "bench": { id: "rT7DgCr-3pg", channel: "ScottHermanFitness", title: "How To: Barbell Bench Press" },
  "shoulder": { id: "qEwKCR5JCog", channel: "ScottHermanFitness", title: "How To: Dumbbell Shoulder Press" },
  "cablerow": { id: "YKAeU55CkVk", channel: "ScottHermanFitness", title: "How To: Wide-Grip Low Row (LF Cable)" },
  "latpull": { id: "SALxEARiMkw", channel: "ATHLEAN-X™", title: "How to do Lat Pulldowns (AVOID MISTAKES!)" },
  "tricep": { id: "qHDrQglWgS4", channel: "Buff Dudes Workouts", title: "How to Perform Cable Rope Pushdown | Triceps Exercise Tutorial" },
  "bicep": { id: "ykJmrZ5v0Oo", channel: "Howcast", title: "How to Do a Dumbbell Biceps Curl | Arm Workout" },
  "squat": { id: "gcNh17Ckjgg", channel: "Jeremy Ethier", title: "How to PROPERLY Squat for Growth (4 Easy Steps)" },
  "legprss": { id: "B6rGDcfyPto", channel: "Renaissance Periodization", title: "How To Leg Press For Best Quad Growth | Targeting The Muscle Series" },
  "rdl": { id: "_oyxCn2iSjU", channel: "Jeff Nippard", title: "HOW TO DO ROMANIAN DEADLIFTS (RDLs): Build Beefy Hamstrings With Perfect Technique" },
  "legcurl": { id: "t9sTSr-JYSs", channel: "SilverSneakers", title: "Beginner's Guide: Seated Leg Curl" },
  "calf": { id: "YMmgqO8Jo-k", channel: "ScottHermanFitness", title: "How To: Standing Calf (BM)" },
  "plank": { id: "mwlp75MS6Rg", channel: "National Academy of Sports Medicine (NASM)", title: "How to do a Plank | Proper Form & Technique | NASM" },
  "bentrow": { id: "bm0_q9bR_HA", channel: "National Academy of Sports Medicine (NASM)", title: "How to do a Barbell Bent Over Row Pronated" },
  "incline": { id: "gl8H4QLXKTo", channel: "Buff Dudes Workouts", title: "How to Perform Incline Dumbbell Press | Upper Chest Exercise Tutorial" },
  "facepull": { id: "ljgqer1ZpXg", channel: "ATHLEAN-X™", title: "STOP F*cking Up Face Pulls (PROPER FORM!)" },
  "lateral": { id: "Y29xKcze8Ik", channel: "Physique Development", title: "How to Perform Dumbbell Lateral Raise | Form Tutorial" },
  "ohtri": { id: "fYqswDVbJDg", channel: "ScottHermanFitness", title: "HOW TO: Overhead Triceps Extension (BEST EXERCISE FOR HUGE TRICEPS) || PERFECT FORM (POWERBOMB)" },
  "hammer": { id: "BRVDS6HVR9Q", channel: "Buff Dudes Workouts", title: "How To Perform HAMMER CURLS | Biceps Exercise Tutorial" },
  "deadlift": { id: "TU2xZ7s4jus", channel: "Alan Thrall (Untamed Strength)", title: "The Trap Bar Deadlift" },
  "bss": { id: "hPlKPjohFS0", channel: "Squat University", title: "The PERFECT Bulgarian Split Squat (Avoid These Errors!)" },
  "hipthru": { id: "xDmFkJxPzeM", channel: "Jeff Nippard", title: "How To Build Great Glutes with Perfect Hip Thrust Technique (Fix Mistakes!)" },
  "legext": { id: "ljO4jkwv8wQ", channel: "Jeff Nippard", title: "How To Do Leg Extensions With Perfect Technique (Grow Every Quad Head)" },
  "kneeraise": { id: "RD_A-Z15ER4", channel: "Renaissance Periodization", title: "Hanging Knee Raise" },
  "db-bench": { id: "SzcSrpVr0GA", channel: "ATHLEAN-X™", title: "Stop Doing Dumbbell Bench Press Like This (I'M BEGGING YOU!)" },
  "smith-press": { id: "O5viuEPDXKY", channel: "Renaissance Periodization", title: "Smith Machine Bench Press" },
  "weighted-pushup": { id: "xZRBXI7we44", channel: "Andrew Alinda", title: "Weighted Push Up Tutorial | For INCREDIBLE PUSHING GAINS" },
  "standing-db-press": { id: "XBOODv-Y6dc", channel: "Tim Bullici", title: "Standing Dumbbell Shoulder Press | Exercise Tutorial for Beginners (Build Muscle & Strength)" },
  "machine-shoulder-press": { id: "WvLMauqrnK8", channel: "Renaissance Periodization", title: "Machine Shoulder Press" },
  "arnold-press": { id: "ris9tKqMwgU", channel: "ATHLEAN-X™", title: "Stop F*cking Up The Arnold Press (PROPER FORM!)" },
  "tbar-row": { id: "m2KAkQV7pdA", channel: "Seth Feroce", title: "How-To: T-Bar Rows - Feroce Iron Academy" },
  "chest-supported-row": { id: "H75im9fAUMc", channel: "Men's Health", title: "Chest-Supported Row" },
  "single-arm-db-row": { id: "gfUg6qWohTk", channel: "ATHLEAN-X™", title: "STOP F*cking Up Dumbbell Rows (PROPER FORM!)" },
  "cable-row-underhand": { id: "YUhAXDSL7Ko", channel: "KAGED", title: "Reverse Grip Cable Row | How To Perform Them Correctly" },
  "pendlay-row": { id: "h4nkoayPFWw", channel: "Buff Dudes", title: "How to Perform the Pendlay Row - Exercise Tutorial" },
  "assisted-pullup": { id: "wFj808u2HWU", channel: "PureGym", title: "How To Use The Assisted Pull Up Machine" },
  "neutral-pulldown": { id: "E1FK9APxk54", channel: "Seriously Strong Training", title: "Neutral Grip Pulldowns [Perfect Form in 60 Seconds]" },
  "straight-arm-pulldown": { id: "G9uNaXGTJ4w", channel: "Renaissance Periodization", title: "Straight Arm Pulldown" },
  "tricep-bar-pushdown": { id: "_w-HpW70nSQ", channel: "ScottHermanFitness", title: "HOW TO: Cable Triceps Pushdown || 3 Golden Rules (FOR GROWTH)" },
  "overhead-db-extension": { id: "-Vyt2QdsR7E", channel: "ScottHermanFitness", title: "How To: Standing Overhead Dumbbell Tricep Extension" },
  "dips": { id: "vi1-BOcj3cQ", channel: "ATHLEAN-X™", title: "Are You Doing Dips Properly? (AVOID MISTAKES!)" },
  "skull-crusher": { id: "8t2a93BjDec", channel: "Renaissance Periodization", title: "How to Do SKULLCRUSHERS for BIG Triceps | Targeting The Muscle Series" },
  "close-grip-bench": { id: "vEUyEOVn3yM", channel: "BarBend", title: "Close-Grip Bench Press Guide | 3 Mistakes to AVOID" },
  "barbell-curl": { id: "kwG2ipFRgfo", channel: "Howcast", title: "How to Do a Barbell Curl | Arm Workout" },
  "cable-curl": { id: "GNlopToAZyg", channel: "PureGym", title: "How To Do A Cable Curl" },
  "concentration-curl": { id: "ZcU2hN76UyA", channel: "Bodybuilding.com", title: "Concentration Curls - Biceps Exercise - Bodybuilding.com" },
  "cross-body-curl": { id: "7MrzVaPM0Uw", channel: "Horton Barbell", title: "Cross Body Hammer Curl (Exercise Library)" },
  "cable-hammer-curl": { id: "vsarApmqJmo", channel: "Bodybuilding.com", title: "How To: Cable Hammer Curl | Shaun Stafford" },
  "zottman-curl": { id: "FSGDM9-dZ9w", channel: "Bodybuilding.com", title: "Zottman Curl | Exercise Guide" },
  "goblet-squat": { id: "zsN2WvklwDk", channel: "Janice Liang", title: "Dumbbell Goblet Squat: Correct Form & Common Mistakes" },
  "hack-squat": { id: "36_EC-MgVz8", channel: "Muscle & Motion", title: "The Hack Squat Guide: Form, Muscles, and Mistakes to Avoid" },
  "safety-bar-squat": { id: "b2jmZyptN64", channel: "Rogue Fitness", title: "How to Use a Safety Squat Bar with Steve Slater" },
  "db-step-up": { id: "9ZknEYboBOQ", channel: "Bobby Maximus", title: "Dumbbell Step-up - How To" },
  "db-reverse-lunge": { id: "Q2k3kYbtOcI", channel: "OPEX Fitness", title: "Dumbbell Reverse Lunge" },
  "single-leg-press": { id: "ZYDTJaAM-gE", channel: "Buff Dudes Workouts", title: "SINGLE LEG PRESS | Legs | How-To Exercise Tutorial" },
  "sl-rdl": { id: "k83AIfjDbnI", channel: "Caroline Drury Fitness", title: "How to do a Dumbbell or Kettlebell Single-Leg RDL (Romanian Deadlift)" },
  "good-morning": { id: "nWyx81AfTos", channel: "PureGym", title: "How To Do A Barbell Good Morning" },
  "cable-pull-through": { id: "fbF4_pn_0xc", channel: "Live Lean TV Daily Exercises", title: "How To Do A CABLE PULL THROUGH | Exercise Demonstration Video and Guide" },
  "sumo-deadlift": { id: "e0zwvjIPZ_w", channel: "Jordan Syatt", title: "Sumo Deadlift Form: Everything You Need to Know" },
  "trap-bar-deadlift": { id: "vX0QDhjexzI", channel: "Juggernaut Training Systems", title: "Trap Bar Deadlift: How, Why & When to Use It | Juggernaut Coaching Tips" },
  "glute-bridge": { id: "KI6fjDqGZh4", channel: "Born Fitness", title: "Glute Bridge: How To (3 steps to proper form)" },
  "banded-hip-thrust": { id: "8srgd_ZCKq4", channel: "Hammer Fitness", title: "Banded Hip Thrusts: How To" },
  "nordic-curl": { id: "F-AaE8mw_pY", channel: "[P]rehab", title: "Master The Nordic Hamstring Curl to Improve Your Hamstring Strength" },
  "single-leg-curl": { id: "Qsc45sDpvbM", channel: "Live Lean TV Daily Exercises", title: "How To: Single Leg Seated Leg Curl" },
  "swiss-ball-curl": { id: "vPPtheKmwbw", channel: "Elite Performance Institute", title: "Swiss Ball Hamstring Curl" },
  "seated-calf-raise": { id: "I1uQtobaNRQ", channel: "FIT.nl", title: "Seated Calf Raise | Proper Form Tutorial for Stronger Calves" },
  "donkey-calf-raise": { id: "Ko_kZoahbAw", channel: "Live Lean TV Daily Exercises", title: "How To Do A MACHINE DONKEY CALF RAISE | Exercise Demonstration Video and Guide" },
  "leg-press-calf": { id: "OMUvfMZOcSA", channel: "Travis Tarrant", title: "Exercise Tutorial: Calf Raise On Leg Press Machine" },
  "dead-bug": { id: "bxn9FBrt4-A", channel: "National Academy of Sports Medicine (NASM)", title: "How to do a Dead Bug | Proper Form & Technique | NASM" },
  "rkc-plank": { id: "tpN-L82mt90", channel: "Body Smart Training", title: "How to: RKC Plank" },
  "ab-wheel": { id: "nCh8VfWY5_g", channel: "Redefining Strength", title: "How to do AB WHEEL Rollouts the Right Way (3 Tips!)" },
  "incline-barbell-press": { id: "2jFFCy8JBU8", channel: "PureGym", title: "How To Do A Barbell Incline Bench Press" },
  "high-cable-fly": { id: "EyzmhTd_kds", channel: "Physique Development", title: "How to: Cable Fly for Lower Chest (High to Low)" },
  "pec-deck": { id: "-DZXcuPi4vk", channel: "Live Lean TV Daily Exercises", title: "How To: Pec Deck Machine Fly" },
  "band-pull-apart": { id: "smSSXITNpCI", channel: "Rogue Fitness", title: "How To Do Band Pull Aparts" },
  "db-reverse-fly": { id: "JoCRRZ3zRtI", channel: "HybridFitness", title: "How to: Dumbbell Reverse Fly" },
  "cable-external-rotation": { id: "vjUE_9BsPUU", channel: "Travis Tarrant", title: "Exercise Tutorial: Cable Machine Shoulder External Rotation" },
  "cable-lateral-raise": { id: "epjuphvl0is", channel: "Jack Cooper", title: "How To Do A Single Arm Cable Lateral Raise | Proper Form & Technique" },
  "machine-lateral-raise": { id: "eJiN69l57J8", channel: "Hammer Fitness", title: "Machine Side Lateral Raise: How To" },
  "upright-row": { id: "EMW4DavLSo8", channel: "Hammer Fitness", title: "Barbell Upright Row: How To" },
  "terminal-knee-extension": { id: "Q6JjgU2aNj0", channel: "Horton Barbell", title: "TKEs (Terminal Knee Extensions) (Exercise Library)" },
  "vmo-squat": { id: "3NFgwO10IEA", channel: "Mission MVMT", title: "Heel Elevated Squat" },
  "sissy-squat": { id: "H9f3dt6fJ8A", channel: "PerformanceMD", title: "How to Do the Sissy Squat (Complete Beginner Tutorial)" },
  "cable-crunch": { id: "0KEP6A1deBE", channel: "Travis Tarrant", title: "Exercise Tutorial: Kneeling Cable Crunch" },
  "decline-situp": { id: "N7hf1_vcX5w", channel: "PureGym", title: "How To Do Decline Sit Ups" },
  "l-sit": { id: "ZZx_06F2iKs", channel: "MG athletic", title: "How to Do an L-Sit Hold | Full Beginner Tutorial (Step-by-Step)" },
  "wu-row-easy": { id: "4zWu1yuJ0_g", channel: "concept2usa", title: "Correct Rowing Machine Technique, Improve Your Rowing  | Concept2" },
  "wu-bike-easy": { id: "1jYKo8DIx4I", channel: "Assault Fitness", title: "Assault Fitness Tuesday Tips: Warming Up With The Assault AirBike" },
  "wu-band-pull-apart": { id: "yIVdFq14LiE", channel: "GaglioneStrength", title: "The Band Pull Apart Guide!" },
  "wu-band-dislocate": { id: "GTf_xy8QJi8", channel: "PureGym", title: "How To Do Shoulder Dislocates" },
  "wu-scap-pushup": { id: "QzLwH-i0vLk", channel: "Precision Nutrition", title: "How to Do Scapular Push Ups | Men" },
  "wu-band-external-rotation": { id: "4fM554Org3o", channel: "Onyx Physical Therapy and Wellness", title: "Shoulder External Rotation with Resistance Band" },
  "wu-glute-bridge": { id: "KI6fjDqGZh4", channel: "Born Fitness", title: "Glute Bridge: How To (3 steps to proper form)" },
  "wu-worlds-greatest-stretch": { id: "-CiWQ2IvY34", channel: "Squat University", title: "The World's Greatest Stretch (Mobility Exercise) by Squat University" },
  "wu-leg-swings": { id: "korxBhGzzJE", channel: "Jay Johnson", title: "Leg Swings Warm-Up (LS)" },
  "wu-goblet-squat-pry": { id: "qRzwMqVzdjw", channel: "Viking Strength Systems", title: "Prying Goblet Squat  - Viking Strength Systems" },
  "wu-ankle-rock": { id: "Gs4AyvJpG1M", channel: "Train With Cuz", title: "Knee-to-Wall Ankle Rocks – Improve Ankle Mobility" },
  "wu-cat-cow": { id: "vuyUwtHl694", channel: "California Department of Public Health", title: "Cat Cow" },
  "wu-open-book": { id: "rDviWORCWEw", channel: "Revival Performance Physical Therapy", title: "Open Books (Sidelying Thoracic Rotation)" },
  "wu-dead-hang": { id: "3CEmHJXbNpc", channel: "Adam McCubbin", title: "How to dead hang" },
  "wu-hip-hinge-dowel": { id: "ctMrDzw8LYQ", channel: "Champion Physical Therapy and Performance", title: "How To Perform A Dowel Hip Hinge" },
  "wu-bird-dog": { id: "ZdAHe9_HeEw", channel: "National Academy of Sports Medicine (NASM)", title: "How to do a Bird Dog | Proper Form & Technique | NASM" },
  "cd-doorway-pec-stretch": { id: "bZ-eaBPOGiM", channel: "Wellen", title: "How to do Doorway Pec Stretch - Flexibility - Wellen" },
  "cd-cross-body-shoulder": { id: "KrBCD8Hv-fk", channel: "Physical Therapy & Hand Clinic of Hillsboro", title: "Eliminate Shoulder Pain With This Exercise - Cross Body Adduction (Posterior Capsule Stretch)" },
  "cd-overhead-triceps": { id: "cPTrm13hSSo", channel: "PureGym", title: "How To Do Overhead Tricep Stretch" },
  "cd-childs-pose": { id: "BBZOrpOymEc", channel: "Momenta Chiropractic", title: "Child's Pose Lat Stretch to Relieve Tight Lats and Improve Shoulder Mobility" },
  "cd-hip-flexor-stretch": { id: "F55tzqJggAY", channel: "Cara Giusti, PT, DPT", title: "Half Kneeling Hip Flexor Stretch | B3 Physical Therapy" },
  "cd-standing-quad": { id: "XBLIiQS5RQI", channel: "National Academy of Sports Medicine (NASM)", title: "How to do a Static Standing Quadriceps Stretch" },
  "cd-figure-four": { id: "-g0nuyTHMrI", channel: "AskDoctorJo", title: "Piriformis Figure 4 Stretch - Ask Doctor Jo" },
  "cd-calf-stretch": { id: "xDhzGbQ6dmM", channel: "PhysioMSK – Expert Musculoskeletal Advice", title: "How to stretch your calf muscles properly - Gastocnemius and Soleus muscle stretches." },
  "cd-biceps-wall-stretch": { id: "BzPzDuIn1PA", channel: "LIVESTRONG", title: "Wall Bicep Stretch" },
  "cd-thread-the-needle": { id: "JPK24P1JD6s", channel: "Lu Strength & Therapy", title: "Thread the Needle (IMPROVE Thoracic Rotation Mobility)" },
  "cd-hamstring-stretch": { id: "Il1L75v6gq0", channel: "AskDoctorJo", title: "Hamstring Stretch with a Strap, Supine - Ask Doctor Jo" },
};

/** Ids intentionally without a video (none could be verified). */
export const NO_VIDEO: readonly string[] = [];

export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function videoFor(id: string | null | undefined): ExerciseVideo | null {
  if (!id) return null;
  const v = VIDEOS[id];
  return v && YOUTUBE_ID_RE.test(v.id) ? v : null;
}

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
/** Privacy-enhanced embed; only built after the user taps play. */
export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;
export const thumbnailUrl = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
