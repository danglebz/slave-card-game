// re-export the form schemas from shared/ — single source of truth shared with the server
// (keep this file for compatibility with existing client-side imports)
export { NameSchema, CodeSchema, validateField } from '../../../shared/schemas';
export type { FieldResult } from '../../../shared/schemas';
