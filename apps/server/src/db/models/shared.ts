/**
 * Options every collection shares.
 *
 * `strict: 'throw'` is the important one. Mongoose's default silently drops a
 * field that is not in the schema, which turns a typo in a write into data that
 * vanishes without a sound — and turns a mass-assignment attempt into a quiet
 * partial success. Throwing makes both loud.
 */
/* Deliberately not annotated `: SchemaOptions`. Widening the literal to the
   declared type makes Mongoose infer the document shape from an opaque options
   object, and every `InferSchemaType` downstream collapses to `{ id: string }`
   — losing type safety on every document in the project, silently. */
export const baseOptions = {
  timestamps: true,
  strict: 'throw' as const,
  strictQuery: 'throw' as const,
  /* No `__v`: this project never uses Mongoose's document versioning, and an
     unexplained field in Compass is a question a reviewer has to ask. */
  versionKey: false as const,
  /* `_id` as a string in JSON, and nothing internal leaking into a response. */
  toJSON: {
    virtuals: true,
    transform: (_doc: unknown, record: Record<string, unknown>) => {
      record['id'] = String(record['_id']);
      delete record['_id'];
      return record;
    },
  },
};

/* Plain object literals, deliberately not typed as `SchemaTypeOptions<string>`:
   that is a *class* type, and spreading a class instance loses its prototype —
   which the lint rules catch, correctly. Mongoose accepts these structurally. */
export const requiredString = {
  type: String,
  required: true,
  trim: true,
};

export const shortString = {
  type: String,
  trim: true,
  maxlength: 200,
};

/**
 * Free-form text written by a person: a message, a resolution, a note.
 *
 * The cap is a denial-of-service control as much as a schema rule — without it
 * a single document can be as large as the request limit allows, repeatedly.
 * 8 000 characters is comfortably more than any real support message and far
 * less than MongoDB's 16 MB document ceiling.
 */
export const longText = {
  type: String,
  trim: true,
  maxlength: 8000,
};
