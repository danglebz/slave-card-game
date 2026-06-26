// validation.js — สคีมา Valibot สำหรับฟอร์มเข้าห้อง (ชื่อผู้เล่น + รหัสห้อง)
import * as v from 'valibot';

// ชื่อผู้เล่น: ตัดช่องว่างหัวท้าย, ต้องมี 1–16 ตัว
export const NameSchema = v.pipe(
  v.string('กรุณาใส่ชื่อ'),
  v.trim(),
  v.minLength(1, 'กรุณาใส่ชื่อก่อน'),
  v.maxLength(16, 'ชื่อยาวเกินไป (สูงสุด 16 ตัว)'),
);

// รหัสห้อง: ตัดช่องว่าง → ตัวพิมพ์ใหญ่ → ต้องเป็นตัวอักษร/ตัวเลข 4 ตัว
export const CodeSchema = v.pipe(
  v.string('กรุณาใส่รหัสห้อง'),
  v.trim(),
  v.toUpperCase(),
  v.nonEmpty('กรุณาใส่รหัสห้อง'),
  v.length(4, 'รหัสห้องต้องมี 4 ตัว'),
  v.regex(/^[A-Z0-9]{4}$/, 'รหัสห้องไม่ถูกต้อง (ตัวอักษร/ตัวเลขเท่านั้น)'),
);

// validate ค่าหนึ่งฟิลด์ → { ok, value } หรือ { ok:false, message } (ข้อความ issue แรก)
export function validateField(schema, value) {
  const r = v.safeParse(schema, value);
  return r.success ? { ok: true, value: r.output } : { ok: false, message: r.issues[0].message };
}
