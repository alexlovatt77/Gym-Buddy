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

window.studioEnsureDefaultMeals = function (store) {
  if (!store || !Array.isArray(store.meals)) return false;
  if (store.defaultMealsSeeded) return false;
  var byId = {};
  store.meals.forEach(function (meal) {
    if (meal && meal.id) byId[meal.id] = true;
  });
  (window.STUDIO_DEFAULT_MEALS || []).forEach(function (meal) {
    if (byId[meal.id]) return;
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
  return true;
};
