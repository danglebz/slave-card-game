// errors.ts — errors carrying an i18n key + vars (client translates per language)
// throw via gerr(), then index.ts catches and emits as errorMsg { key, vars }

export type ErrorVars = Record<string, string | number>;

export class GameError extends Error {
  key: string;
  vars?: ErrorVars;
  constructor(key: string, vars?: ErrorVars) {
    super(key);
    this.name = 'GameError';
    this.key = key;
    this.vars = vars;
  }
}

/** Throw a GameError (use instead of throw new Error('Thai text')) */
export function gerr(key: string, vars?: ErrorVars): never {
  throw new GameError(key, vars);
}
