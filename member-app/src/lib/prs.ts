import AsyncStorage from "@react-native-async-storage/async-storage";

export type PersonalRecordEntry = {
  id: string;
  exercise: string;
  value: string;
};

const personalRecordsStorageKey = "compoundos/member/personal-records";

export async function loadPersonalRecords() {
  const raw = await AsyncStorage.getItem(personalRecordsStorageKey).catch(
    () => null
  );

  if (!raw) {
    return [] as PersonalRecordEntry[];
  }

  try {
    const parsed = JSON.parse(raw) as PersonalRecordEntry[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry) =>
        typeof entry?.id === "string" &&
        typeof entry?.exercise === "string" &&
        typeof entry?.value === "string"
    );
  } catch {
    return [];
  }
}

export async function savePersonalRecords(records: PersonalRecordEntry[]) {
  await AsyncStorage.setItem(personalRecordsStorageKey, JSON.stringify(records));
}

export function createEmptyPersonalRecord(index: number): PersonalRecordEntry {
  return {
    id: `pr-${Date.now()}-${index}`,
    exercise: "",
    value: ""
  };
}
