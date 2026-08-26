/* Exercise library by primary muscle group + secondary set credits. */
window.STUDIO_MUSCLE_GROUPS = [
  "Glutes",
  "Quads",
  "Hamstrings",
  "Calves",
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Traps",
];

window.STUDIO_DEFAULT_TARGETS = {
  Glutes: 6,
  Quads: 16,
  Hamstrings: 12,
  Calves: 18,
  Chest: 14,
  Back: 20,
  Shoulders: 16,
  Biceps: 14,
  Triceps: 14,
  Traps: 10,
};

window.STUDIO_EXERCISE_LIBRARY = [
  {
    category: "Calves",
    exercises: ["Calf raises"],
  },
  {
    category: "Quads",
    exercises: ["Quad extensions", "Elevated lunges", "Quad squats"],
  },
  {
    category: "Hamstrings",
    exercises: ["Hamstring curls", "Hip thrusts", "Bulgarian split squat"],
  },
  {
    category: "Biceps",
    exercises: ["Single-arm bicep curls", "Barbell curls", "Bicep pull-downs"],
  },
  {
    category: "Triceps",
    exercises: [
      "Seated decline curls",
      "Cable curls",
      "Tricep rope push-downs",
      "Skull crushers",
      "Overhead tricep extensions",
      "Single-arm tricep push-downs",
      "Tricep dumbbell bench",
      "Tricep barbell bench",
      "Overhead tricep dumbbell raises",
    ],
  },
  {
    category: "Chest",
    exercises: [
      "Incline smith press",
      "Smith press",
      "Incline dumbbell press",
      "Dumbbell press",
      "Cable flies",
      "Machine flies",
      "Chest press",
      "Dips",
    ],
  },
  {
    category: "Shoulders",
    exercises: [
      "Dumbbell shoulder press",
      "Military press",
      "Face pulls",
      "Lateral raises",
      "Front raises",
    ],
  },
  {
    category: "Traps",
    exercises: ["Shrugs"],
  },
  {
    category: "Back",
    exercises: [
      "Pull-ups",
      "Lat pull-down",
      "Cable rows",
      "Cable pull-downs",
      "Bent-over smith row",
      "Bent-over barbell row",
    ],
  },
  {
    category: "Glutes",
    exercises: [],
  },
];

/* Workout picker only — volume still credits primary muscle groups above. */
window.STUDIO_PPL_LIBRARY = [
  {
    category: "Push",
    exercises: [
      "Incline smith press",
      "Smith press",
      "Incline dumbbell press",
      "Dumbbell press",
      "Cable flies",
      "Machine flies",
      "Chest press",
      "Dips",
      "Dumbbell shoulder press",
      "Military press",
      "Lateral raises",
      "Front raises",
      "Seated decline curls",
      "Cable curls",
      "Tricep rope push-downs",
      "Skull crushers",
      "Overhead tricep extensions",
      "Single-arm tricep push-downs",
      "Tricep dumbbell bench",
      "Tricep barbell bench",
      "Overhead tricep dumbbell raises",
    ],
  },
  {
    category: "Pull",
    exercises: [
      "Pull-ups",
      "Lat pull-down",
      "Cable rows",
      "Cable pull-downs",
      "Bent-over smith row",
      "Bent-over barbell row",
      "Face pulls",
      "Shrugs",
      "Single-arm bicep curls",
      "Barbell curls",
      "Bicep pull-downs",
    ],
  },
  {
    category: "Legs",
    exercises: [
      "Quad extensions",
      "Elevated lunges",
      "Quad squats",
      "Hamstring curls",
      "Hip thrusts",
      "Bulgarian split squat",
      "Calf raises",
    ],
  },
];

/**
 * Primary group gets 1.0 per set. Optional secondaries get 0.5 each.
 * Rules: bench press → shoulders + triceps; dips → triceps; overhead press → triceps;
 * pull-ups → biceps; rows → biceps; squats → glutes; hip thrusts → glutes.
 */
window.studioSetCredits = function (exerciseName) {
  var name = String(exerciseName || "").toLowerCase();
  var library = window.STUDIO_EXERCISE_LIBRARY || [];
  var primary = null;

  for (var i = 0; i < library.length; i++) {
    var group = library[i];
    for (var j = 0; j < group.exercises.length; j++) {
      if (group.exercises[j].toLowerCase() === name) {
        primary = group.category;
        break;
      }
    }
    if (primary) break;
  }

  if (!primary) return [];

  var credits = [{ group: primary, amount: 1 }];

  function addSecondary(group, amount) {
    if (group === primary) return;
    credits.push({ group: group, amount: amount });
  }

  var isBenchPress =
    name === "incline smith press" ||
    name === "smith press" ||
    name === "incline dumbbell press" ||
    name === "dumbbell press" ||
    name === "chest press" ||
    name === "tricep dumbbell bench" ||
    name === "tricep barbell bench";

  var isOverheadPress =
    name === "dumbbell shoulder press" || name === "military press";

  var isRow =
    name === "cable rows" ||
    name === "bent-over smith row" ||
    name === "bent-over barbell row";

  if (isBenchPress) {
    addSecondary("Shoulders", 0.5);
    addSecondary("Triceps", 0.5);
  }
  if (name === "dips") addSecondary("Triceps", 0.5);
  if (isOverheadPress) addSecondary("Triceps", 0.5);
  if (name === "pull-ups") addSecondary("Biceps", 0.5);
  if (isRow) addSecondary("Biceps", 0.5);
  if (name === "quad squats") addSecondary("Glutes", 0.5);
  if (name === "hip thrusts") addSecondary("Glutes", 0.5);

  return credits;
};
