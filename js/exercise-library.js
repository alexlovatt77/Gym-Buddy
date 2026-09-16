/* Exercise library by primary muscle group + secondary set credits. */
window.STUDIO_MUSCLE_GROUPS = [
  "Back",
  "Biceps",
  "Calves",
  "Chest",
  "Glutes",
  "Hamstrings",
  "Quads",
  "Shoulders",
  "Traps",
  "Triceps",
];

window.STUDIO_DEFAULT_TARGETS = {
  Back: 20,
  Biceps: 14,
  Calves: 18,
  Chest: 14,
  Glutes: 6,
  Hamstrings: 12,
  Quads: 16,
  Shoulders: 16,
  Traps: 10,
  Triceps: 14,
};

function studioSortNames(list) {
  return list.slice().sort(function (a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  });
}

window.STUDIO_EXERCISE_LIBRARY = [
  {
    category: "Back",
    exercises: studioSortNames([
      "Bent-over barbell row",
      "Bent-over smith row",
      "Cable pull-downs",
      "Cable rows",
      "Lat pull-down",
      "Pull-ups",
    ]),
  },
  {
    category: "Biceps",
    exercises: studioSortNames([
      "Barbell curls",
      "Bicep pull-downs",
      "Cable curls",
      "Seated decline curls",
      "Single-arm bicep curls",
    ]),
  },
  {
    category: "Calves",
    exercises: studioSortNames(["Calf raises"]),
  },
  {
    category: "Chest",
    exercises: studioSortNames([
      "Cable flies",
      "Chest press",
      "Dips",
      "Dumbbell press",
      "Incline dumbbell press",
      "Incline smith press",
      "Machine flies",
      "Smith press",
    ]),
  },
  {
    category: "Glutes",
    exercises: studioSortNames(["Hip thrusts"]),
  },
  {
    category: "Hamstrings",
    exercises: studioSortNames(["Hamstring curls", "Prone leg curl"]),
  },
  {
    category: "Quads",
    exercises: studioSortNames([
      "Bulgarian split squat",
      "Elevated lunges",
      "Hack squat",
      "Quad extensions",
      "Quad squats",
    ]),
  },
  {
    category: "Shoulders",
    exercises: studioSortNames([
      "Dumbbell shoulder press",
      "Face pulls",
      "Front raises",
      "Lateral raises",
      "Military press",
    ]),
  },
  {
    category: "Traps",
    exercises: studioSortNames(["Shrugs"]),
  },
  {
    category: "Triceps",
    exercises: studioSortNames([
      "Overhead tricep dumbbell raises",
      "Overhead tricep extensions",
      "Single-arm tricep push-downs",
      "Skull crushers",
      "Tricep barbell bench",
      "Tricep dumbbell bench",
      "Tricep rope push-downs",
    ]),
  },
];

/* Workout picker only — volume still credits primary muscle groups above. */
window.STUDIO_PPL_LIBRARY = [
  {
    category: "Push",
    exercises: studioSortNames([
      "Cable flies",
      "Chest press",
      "Dips",
      "Dumbbell press",
      "Dumbbell shoulder press",
      "Front raises",
      "Incline dumbbell press",
      "Incline smith press",
      "Lateral raises",
      "Machine flies",
      "Military press",
      "Overhead tricep dumbbell raises",
      "Overhead tricep extensions",
      "Single-arm tricep push-downs",
      "Skull crushers",
      "Smith press",
      "Tricep barbell bench",
      "Tricep dumbbell bench",
      "Tricep rope push-downs",
    ]),
  },
  {
    category: "Pull",
    exercises: studioSortNames([
      "Barbell curls",
      "Bent-over barbell row",
      "Bent-over smith row",
      "Bicep pull-downs",
      "Cable curls",
      "Cable pull-downs",
      "Cable rows",
      "Face pulls",
      "Lat pull-down",
      "Pull-ups",
      "Seated decline curls",
      "Shrugs",
      "Single-arm bicep curls",
    ]),
  },
  {
    category: "Legs",
    exercises: studioSortNames([
      "Bulgarian split squat",
      "Calf raises",
      "Elevated lunges",
      "Hack squat",
      "Hamstring curls",
      "Hip thrusts",
      "Prone leg curl",
      "Quad extensions",
      "Quad squats",
    ]),
  },
];

/**
 * Primary group gets 1.0 per set. Optional secondaries get 0.5 each.
 * Bench presses → shoulders + triceps; dips → triceps; overhead press → triceps;
 * pull-ups / rows → biceps; squats / hack squat → glutes; lunges / split squat → glutes.
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

  var isSquatPattern =
    name === "quad squats" ||
    name === "hack squat" ||
    name === "bulgarian split squat" ||
    name === "elevated lunges";

  if (isBenchPress) {
    addSecondary("Shoulders", 0.5);
    addSecondary("Triceps", 0.5);
  }
  if (name === "dips") addSecondary("Triceps", 0.5);
  if (isOverheadPress) addSecondary("Triceps", 0.5);
  if (name === "pull-ups") addSecondary("Biceps", 0.5);
  if (isRow) addSecondary("Biceps", 0.5);
  if (isSquatPattern) addSecondary("Glutes", 0.5);
  if (name === "hip thrusts") addSecondary("Hamstrings", 0.5);

  return credits;
};
