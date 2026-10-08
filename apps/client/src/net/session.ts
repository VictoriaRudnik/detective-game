const KEYS = { playerId: "liveSuspects.playerId", name: "liveSuspects.name", uiLanguage: "liveSuspects.uiLanguage" };

// Storage can be unavailable (private mode, blocked site data); the game then just forgets between visits.
function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignored on purpose, see above.
  }
}

export const session = {
  playerId: () => read(KEYS.playerId),
  setPlayerId: (id: string) => write(KEYS.playerId, id),
  name: () => read(KEYS.name),
  setName: (name: string) => write(KEYS.name, name),
  uiLanguage: () => read(KEYS.uiLanguage),
  setUiLanguage: (language: string) => write(KEYS.uiLanguage, language),
};
