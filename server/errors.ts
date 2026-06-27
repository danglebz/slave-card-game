// errors.ts — error ที่มี i18n key + vars (client แปลเองตามภาษา)
// throw ผ่าน gerr() แล้ว index.ts จับมา emit เป็น errorMsg { key, vars }

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

/** โยน GameError (ใช้แทน throw new Error('ข้อความไทย')) */
export function gerr(key: string, vars?: ErrorVars): never {
  throw new GameError(key, vars);
}
