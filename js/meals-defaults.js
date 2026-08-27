/* Default meal library seeds for Macro log / Setup. */
window.STUDIO_DEFAULT_MEALS = [
  {
    id: "m_seed_yoghurt_bowl",
    category: "breakfast",
    name: "Yoghurt bowl",
    calories: 450,
    protein: 30,
    fat: 18,
    carbs: 48,
  },
  {
    id: "m_seed_oats",
    category: "breakfast",
    name: "Oats",
    calories: 560,
    protein: 22,
    fat: 17,
    carbs: 82,
  },
  {
    id: "m_seed_crockpot_chicken",
    category: "dinner",
    name: "Crockpot chicken",
    calories: 710,
    protein: 68,
    fat: 19,
    carbs: 62,
  },
  {
    id: "m_seed_protein_shake",
    category: "snack",
    name: "Protein shake",
    calories: 290,
    protein: 36,
    fat: 7,
    carbs: 20,
  },
];

/**
 * Seed built-in meals only once. Never recreate a meal the user removed.
 */
window.studioEnsureDefaultMeals = function (store) {
  if (!store || !Array.isArray(store.meals)) return false;

  var removed = {};
  (Array.isArray(store.removedMealIds) ? store.removedMealIds : []).forEach(function (id) {
    removed[String(id)] = true;
  });

  if (store.defaultMealsSeeded) return false;

  var byId = {};
  store.meals.forEach(function (meal) {
    if (meal && meal.id != null) byId[String(meal.id)] = true;
  });

  (window.STUDIO_DEFAULT_MEALS || []).forEach(function (meal) {
    var id = String(meal.id);
    if (removed[id] || byId[id]) return;
    store.meals.push({
      id: meal.id,
      category: meal.category,
      name: meal.name,
      calories: meal.calories,
      protein: meal.protein,
      fat: meal.fat,
      carbs: meal.carbs,
    });
  });

  store.defaultMealsSeeded = true;
  if (!Array.isArray(store.removedMealIds)) store.removedMealIds = [];
  return true;
};

window.studioMarkMealRemoved = function (store, mealId) {
  if (!store) return;
  if (!Array.isArray(store.removedMealIds)) store.removedMealIds = [];
  var id = String(mealId);
  if (store.removedMealIds.indexOf(id) < 0) store.removedMealIds.push(id);
  store.defaultMealsSeeded = true;
};

window.studioUnmarkMealRemoved = function (store, mealId) {
  if (!store || !Array.isArray(store.removedMealIds)) return;
  var id = String(mealId);
  store.removedMealIds = store.removedMealIds.filter(function (item) {
    return String(item) !== id;
  });
};
