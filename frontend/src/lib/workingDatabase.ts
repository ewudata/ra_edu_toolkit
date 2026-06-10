export const WORKING_DATABASE_STORAGE_KEY = 'ra_working_database_v1';

export function getWorkingDatabase(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(WORKING_DATABASE_STORAGE_KEY) ?? '';
}

export function setWorkingDatabase(database: string) {
  if (typeof window === 'undefined') return;
  const value = database.trim();
  if (value) {
    window.sessionStorage.setItem(WORKING_DATABASE_STORAGE_KEY, value);
  } else {
    window.sessionStorage.removeItem(WORKING_DATABASE_STORAGE_KEY);
  }
}

export function clearWorkingDatabase() {
  setWorkingDatabase('');
}
