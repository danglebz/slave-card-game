/**
 * Valibot schemas — single source of truth for validating Socket.IO payloads
 *
 * Shared by both client (validate the form before sending) and server (re-validate on receiving an event —
 * server-authoritative: never trust the client). Change it here in one place, both sides get it
 *
 * Constants (e.g. TURN_SECONDS_CHOICES, card id format) must match server/room.ts + game.ts
 */
import * as v from 'valibot';

// ----- Basic fields -----

/** Player name: trim leading/trailing whitespace, must be 1–16 chars */
// Note: error messages are i18n keys — the client translates them via t(lang, key) (see lib/i18n.ts)
export const NameSchema = v.pipe(
  v.string('err.nameEmpty'),
  v.trim(),
  v.minLength(1, 'err.nameEmpty'),
  v.maxLength(16, 'err.nameTooLong'),
);

/** Room code: trim whitespace → uppercase → must be 4 alphanumeric chars */
export const CodeSchema = v.pipe(
  v.string('err.codeEmpty'),
  v.trim(),
  v.toUpperCase(),
  v.nonEmpty('err.codeEmpty'),
  v.length(4, 'err.codeLen'),
  v.regex(/^[A-Z0-9]{4}$/, 'err.codeInvalid'),
);

/** Player color: hex #rrggbb (matches Room.setColor) — normalized to lowercase */
export const ColorSchema = v.pipe(
  v.string('err.colorInvalid'),
  v.regex(/^#[0-9a-fA-F]{6}$/, 'err.colorInvalid'),
  v.toLowerCase(),
);

/** Card id 'rank.suit' — rank 3..15, suit 0..3 (matches game.ts cardId/cardFromId) */
export const CardIdSchema = v.pipe(
  v.string(),
  v.regex(/^(?:[3-9]|1[0-5])\.[0-3]$/, 'err.cardInvalid'),
);

/** Cards sent (play/give) — length-capped to rate-limit large payloads */
export const CardsSchema = v.pipe(
  v.array(CardIdSchema, 'err.cardsType'),
  v.maxLength(27, 'err.cardsTooMany'),
);

/** turnSeconds: must be one of the choices the server accepts (Room.TURN_SECONDS_CHOICES) */
export const TurnSecondsSchema = v.picklist([15, 30, 45, 60], 'err.turnSecInvalid');

// ----- Payload of each event (only events that carry data from the client) -----

export const CreateSchema = v.object({
  name: NameSchema,
  color: v.optional(ColorSchema),
});

export const JoinSchema = v.object({
  code: CodeSchema,
  name: NameSchema,
  color: v.optional(ColorSchema),
});

/** settings is a patch — every field optional, unknown keys are dropped */
export const SettingsPatchSchema = v.object({
  timer: v.optional(v.boolean()),
  autoPass: v.optional(v.boolean()),
  autoPassStuck: v.optional(v.boolean()),
  allowTriple: v.optional(v.boolean()),
  allowQuad: v.optional(v.boolean()),
  allowStraight: v.optional(v.boolean()),
  turnSeconds: v.optional(TurnSecondsSchema),
});

export const SetColorSchema = v.object({ color: ColorSchema });

/** Host kicks a player — referenced by name (guards against index drift as people join/leave) */
export const KickSchema = v.object({ name: NameSchema });

export const PlaySchema = v.object({ cards: CardsSchema });

export const GiveSchema = v.object({ cards: CardsSchema });

/** Web Push subscription from the client — validate the shape + cap lengths to guard against large payloads */
export const PushSubscribeSchema = v.object({
  sub: v.object({
    endpoint: v.pipe(
      v.string('err.generic'),
      v.url('err.generic'),
      v.maxLength(1024, 'err.generic'),
    ),
    // expirationTime: the browser sends number | null — accepted loosely, not used further
    expirationTime: v.optional(v.nullable(v.number())),
    keys: v.object({
      p256dh: v.pipe(v.string('err.generic'), v.maxLength(256, 'err.generic')),
      auth: v.pipe(v.string('err.generic'), v.maxLength(256, 'err.generic')),
    }),
  }),
  lang: v.picklist(['th', 'en'], 'err.generic'),
});

// ----- Inferred types (output after transform) -----
export type CreatePayload = v.InferOutput<typeof CreateSchema>;
export type JoinPayload = v.InferOutput<typeof JoinSchema>;
export type SettingsPatch = v.InferOutput<typeof SettingsPatchSchema>;
export type SetColorPayload = v.InferOutput<typeof SetColorSchema>;
export type KickPayload = v.InferOutput<typeof KickSchema>;
export type PlayPayload = v.InferOutput<typeof PlaySchema>;
export type GivePayload = v.InferOutput<typeof GiveSchema>;

// ----- Helper for validating one field at a time (used in client-side forms) -----
export type FieldResult = { ok: true; value: string } | { ok: false; message: string };

/** Validate one field's value → { ok, value } or { ok:false, message } (the first issue's message) */
export function validateField(
  schema: typeof NameSchema | typeof CodeSchema,
  value: string,
): FieldResult {
  const r = v.safeParse(schema, value);
  return r.success ? { ok: true, value: r.output } : { ok: false, message: r.issues[0].message };
}
