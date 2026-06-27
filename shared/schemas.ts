/**
 * Valibot schemas — single source of truth สำหรับ validate payload ของ Socket.IO
 *
 * ใช้ร่วมทั้ง client (validate ฟอร์มก่อนส่ง) และ server (validate ซ้ำตอนรับ event —
 * server-authoritative: ห้ามเชื่อ client). แก้ที่นี่ที่เดียว ได้ทั้งสองฝั่ง
 *
 * ค่าคงที่ (เช่น TURN_SECONDS_CHOICES, รูปแบบ card id) ต้องตรงกับ server/room.ts + game.ts
 */
import * as v from 'valibot';

// ----- ฟิลด์พื้นฐาน -----

/** ชื่อผู้เล่น: ตัดช่องว่างหัวท้าย, ต้องมี 1–16 ตัว */
// หมายเหตุ: ข้อความ error เป็น i18n key — client แปลเองด้วย t(lang, key) (ดู lib/i18n.ts)
export const NameSchema = v.pipe(
  v.string('err.nameEmpty'),
  v.trim(),
  v.minLength(1, 'err.nameEmpty'),
  v.maxLength(16, 'err.nameTooLong'),
);

/** รหัสห้อง: ตัดช่องว่าง → ตัวพิมพ์ใหญ่ → ต้องเป็นตัวอักษร/ตัวเลข 4 ตัว */
export const CodeSchema = v.pipe(
  v.string('err.codeEmpty'),
  v.trim(),
  v.toUpperCase(),
  v.nonEmpty('err.codeEmpty'),
  v.length(4, 'err.codeLen'),
  v.regex(/^[A-Z0-9]{4}$/, 'err.codeInvalid'),
);

/** สีประจำตัว: hex #rrggbb (ตรงกับ Room.setColor) — normalize เป็นตัวพิมพ์เล็ก */
export const ColorSchema = v.pipe(
  v.string('err.colorInvalid'),
  v.regex(/^#[0-9a-fA-F]{6}$/, 'err.colorInvalid'),
  v.toLowerCase(),
);

/** id ไพ่ 'rank.suit' — rank 3..15, suit 0..3 (ตรงกับ game.ts cardId/cardFromId) */
export const CardIdSchema = v.pipe(v.string(), v.regex(/^(?:[3-9]|1[0-5])\.[0-3]$/, 'err.cardInvalid'));

/** กองไพ่ที่ส่งมา (play/give) — จำกัดความยาวกันสแปม payload ใหญ่ */
export const CardsSchema = v.pipe(
  v.array(CardIdSchema, 'err.cardsType'),
  v.maxLength(27, 'err.cardsTooMany'),
);

/** turnSeconds: ต้องเป็นหนึ่งในตัวเลือกที่ server ยอมรับ (Room.TURN_SECONDS_CHOICES) */
export const TurnSecondsSchema = v.picklist([15, 30, 45, 60], 'err.turnSecInvalid');

// ----- payload ของแต่ละ event (เฉพาะ event ที่มี data จาก client) -----

export const CreateSchema = v.object({
  name: NameSchema,
  color: v.optional(ColorSchema),
});

export const JoinSchema = v.object({
  code: CodeSchema,
  name: NameSchema,
  color: v.optional(ColorSchema),
});

/** settings เป็น patch — ทุกฟิลด์ optional, ตัด key แปลกปลอมทิ้ง */
export const SettingsPatchSchema = v.object({
  timer: v.optional(v.boolean()),
  autoPass: v.optional(v.boolean()),
  autoPassStuck: v.optional(v.boolean()),
  turnSeconds: v.optional(TurnSecondsSchema),
});

export const SetColorSchema = v.object({ color: ColorSchema });

export const PlaySchema = v.object({ cards: CardsSchema });

export const GiveSchema = v.object({ cards: CardsSchema });

// ----- types ที่ infer ออกมา (output หลัง transform) -----
export type CreatePayload = v.InferOutput<typeof CreateSchema>;
export type JoinPayload = v.InferOutput<typeof JoinSchema>;
export type SettingsPatch = v.InferOutput<typeof SettingsPatchSchema>;
export type SetColorPayload = v.InferOutput<typeof SetColorSchema>;
export type PlayPayload = v.InferOutput<typeof PlaySchema>;
export type GivePayload = v.InferOutput<typeof GiveSchema>;

// ----- helper สำหรับ validate ทีละฟิลด์ (ใช้ในฟอร์มฝั่ง client) -----
export type FieldResult = { ok: true; value: string } | { ok: false; message: string };

/** validate ค่าหนึ่งฟิลด์ → { ok, value } หรือ { ok:false, message } (ข้อความ issue แรก) */
export function validateField(
  schema: typeof NameSchema | typeof CodeSchema,
  value: string,
): FieldResult {
  const r = v.safeParse(schema, value);
  return r.success ? { ok: true, value: r.output } : { ok: false, message: r.issues[0].message };
}
