// re-export สคีมาฟอร์มจาก shared/ — single source of truth ใช้ร่วมกับ server
// (เก็บไฟล์นี้ไว้เพื่อความเข้ากันได้ของ import เดิมในฝั่ง client)
export { NameSchema, CodeSchema, validateField } from '../../../shared/schemas';
export type { FieldResult } from '../../../shared/schemas';
