import AsyncStorage from "@react-native-async-storage/async-storage";

const stepGoalStorageKey = "compoundos/member/step-goal";
const defaultDailyStepGoal = 8000;

export async function loadDailyStepGoal() {
  const raw = await AsyncStorage.getItem(stepGoalStorageKey).catch(() => null);
  const parsed = raw ? Number(raw) : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultDailyStepGoal;
  }

  return Math.round(parsed);
}

export async function saveDailyStepGoal(stepGoal: number) {
  const normalized = Math.max(1000, Math.round(stepGoal));
  await AsyncStorage.setItem(stepGoalStorageKey, String(normalized));
  return normalized;
}

export { defaultDailyStepGoal };
