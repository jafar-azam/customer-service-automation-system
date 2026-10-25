import { Schema, model, type Types } from 'mongoose';
import type { DatasetSplit, InputForm, KbStatus, Provenance, ReviewDecision } from '@csas/shared';
import { INPUT_FORMS, KB_STATUSES, PROVENANCE_SOURCES } from '@csas/shared';
import { baseOptions, longText, requiredString, shortString } from './shared.js';

/**
 * The knowledge base: the only thing the assistant is allowed to say.
 *
 * Two properties drive the whole design.
 *
 * **Nothing is usable until an admin approves it.** The reference sequence
 * diagram writes a resolution straight into the knowledge base; here it lands
 * as `pending_review` and the assistant cannot retrieve it. That gate is this
 * project's main defence against teaching the assistant its own mistakes
 * (OWASP LLM04), and against an agent planting instructions that a later
 * customer's question would execute (indirect prompt injection).
 *
 * **History is kept, not overwritten.** A cited answer must stay explicable
 * after the entry is edited, so every message records the entry *version* it
 * used and old versions are retained.
 */

/* Explicitly typed for the same reason as the subdocuments in support.ts:
   inference through nested schemas exhausts TypeScript's recursion budget, and
   a named shape documents the record better than the inferred one did. */
const provenanceSchema = new Schema<Provenance>(
  {
    source: { type: String, enum: [...PROVENANCE_SOURCES], required: true },
    /** SPDX identifier, or `proprietary-local` for data that may never ship. */
    license: { ...requiredString, maxlength: 64 },
    /**
     * The flag step 37's pre-publication audit looks for. A record with
     * `publishable: false` that reaches a committed file fails the release.
     */
    publishable: { type: Boolean, required: true },
    sourceRef: { type: String, maxlength: 200 },
    /** Groups translations and paraphrases of one incident, so a split cannot
        put a question in training and its paraphrase in test. */
    /* Indexed by the collections that embed this, not here: declaring it in
       both places makes Mongoose warn and silently ignore one definition. */
    lineageId: { type: String, maxlength: 64 },
    piiRedaction: {
      type: String,
      enum: ['not_required', 'pending', 'done', 'failed'],
      required: true,
      default: 'not_required',
    },
  },
  { _id: false },
);

/** A frozen copy of what an earlier version said. */
interface KbVersion {
  version: number;
  title: string;
  body: string;
  status: KbStatus;
  editedByStaffId?: Types.ObjectId;
  editedAt: Date;
  changeNote?: string;
}

const kbVersionSchema = new Schema<KbVersion>(
  {
    version: { type: Number, required: true, min: 1 },
    title: { ...requiredString, maxlength: 200 },
    body: { ...longText, required: true },
    status: { type: String, enum: [...KB_STATUSES], required: true },
    editedByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    editedAt: { type: Date, required: true },
    changeNote: shortString,
  },
  { _id: false },
);

/**
 * Named explicitly, like the other large schemas: inferring the document type
 * through a schema this size exhausts TypeScript's recursion budget. A clean
 * build catches that; an incremental one can skip it, which is why CI builds
 * from scratch.
 */
export interface KbEntryRecord {
  title: string;
  body: string;
  question?: string;
  topic?: string;
  category?: string;
  product?: string;
  language: 'ar' | 'en';
  tags: string[];
  status: KbStatus;
  version: number;
  versions: KbVersion[];
  createdByStaffId?: Types.ObjectId;
  approvedByStaffId?: Types.ObjectId;
  approvedAt?: Date;
  reviewNote?: string;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDim?: number;
  embeddingUpdatedAt?: Date;
  provenance: Provenance;
  usageCount: number;
  lastUsedAt?: Date;
  unhelpfulCount: number;
}

const kbEntrySchema = new Schema<KbEntryRecord>(
  {
    title: { ...requiredString, maxlength: 200 },
    body: { ...longText, required: true },
    /** The problem this entry answers, in the customer's words where known. */
    question: { type: String, maxlength: 2000 },

    topic: { ...shortString, index: true },
    category: shortString,
    product: shortString,
    language: { type: String, enum: ['ar', 'en'], required: true, default: 'en' },
    tags: { type: [{ type: String, maxlength: 60, trim: true }], default: [] },

    status: { type: String, enum: [...KB_STATUSES], required: true, default: 'draft', index: true },
    version: { type: Number, required: true, default: 1, min: 1 },
    versions: { type: [kbVersionSchema], default: [] },

    createdByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    approvedByStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser' },
    approvedAt: { type: Date },
    /** Why an admin rejected it — the agent who proposed it needs to know. */
    reviewNote: { type: String, maxlength: 2000 },

    /**
     * The retrieval vector, stored beside the text.
     *
     * In production this is an Atlas Vector Search index; locally it is an
     * in-process cosine scan over these arrays, behind the same `VectorIndex`
     * interface (step 15). The model and dimension are recorded because a
     * fine-tuned embedding model (step 25) makes vectors from two models
     * mutually meaningless — comparing them would silently return nonsense.
     */
    embedding: { type: [Number], default: undefined, select: false },
    embeddingModel: { type: String, maxlength: 120 },
    embeddingDim: { type: Number, min: 1 },
    embeddingUpdatedAt: { type: Date },

    provenance: { type: provenanceSchema, required: true },

    usageCount: { type: Number, required: true, default: 0, min: 0 },
    lastUsedAt: { type: Date },
    /** How often a customer said this answer did **not** solve their problem.
        A high number here is the signal that an entry needs rewriting. */
    unhelpfulCount: { type: Number, required: true, default: 0, min: 0 },
  },
  baseOptions,
);

/**
 * Retrieval filters on status **before** similarity, so this index exists to
 * make that filter cheap. Filtering after the search would still read draft and
 * archived content, which leaks their existence and makes any future bug in the
 * filter a disclosure (THREAT_MODEL §7.2).
 */
kbEntrySchema.index({ 'provenance.lineageId': 1 });
kbEntrySchema.index({ status: 1, topic: 1 });
kbEntrySchema.index({ status: 1, updatedAt: -1 });
/* The degraded-mode keyword search (step 18) when the AI provider is down. */
kbEntrySchema.index({ title: 'text', body: 'text', question: 'text' });
/* The approval queue. Partial, because it only ever lists one status. */
kbEntrySchema.index({ createdAt: 1 }, { partialFilterExpression: { status: 'pending_review' } });
/* Re-import must update, not duplicate. */
kbEntrySchema.index(
  { 'provenance.source': 1, 'provenance.sourceRef': 1 },
  { unique: true, partialFilterExpression: { 'provenance.sourceRef': { $type: 'string' } } },
);

export type KbEntryDoc = KbEntryRecord;
export const KbEntry = model('KbEntry', kbEntrySchema, 'kb_entries');

/* ── Dataset items and review (steps 19–21) ─────────────────────────────── */

/**
 * A question variant generated or collected for training and evaluation.
 *
 * Kept apart from `kb_entries` on purpose: knowledge-base entries are what the
 * assistant reads at runtime, dataset items are what models are trained and
 * measured on. Mixing them is how an evaluation set ends up in the retrieval
 * index and reports a number nobody can defend.
 */
export interface DatasetItemRecord {
  text: string;
  inputForm: InputForm;
  language: 'ar' | 'en';
  expectedKbEntryId?: Types.ObjectId;
  shouldEscalate: boolean;
  split: DatasetSplit;
  reviewStatus: 'pending' | ReviewDecision;
  reviewCount: number;
  provenance: Provenance;
  generatorModel?: string;
}

const datasetItemSchema = new Schema<DatasetItemRecord>(
  {
    /** The question as a customer would write it. */
    text: { ...longText, required: true },
    inputForm: { type: String, enum: [...INPUT_FORMS], required: true },
    language: { type: String, enum: ['ar', 'en'], required: true },

    /** What a correct system should do: cite this entry, or escalate. */
    expectedKbEntryId: { type: Schema.Types.ObjectId, ref: 'KbEntry' },
    shouldEscalate: { type: Boolean, required: true, default: false },

    split: {
      type: String,
      enum: ['train', 'validation', 'test', 'human_eval', 'unassigned'],
      required: true,
      default: 'unassigned',
      index: true,
    },

    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'corrected', 'rejected'],
      required: true,
      default: 'pending',
      index: true,
    },
    /** Reviewer agreement is reported, so the dataset's quality is a measured
        number rather than a claim (step 20). */
    reviewCount: { type: Number, required: true, default: 0, min: 0 },

    provenance: { type: provenanceSchema, required: true },
    /** Which model wrote the variant, for the generated ones. */
    generatorModel: shortString,
  },
  baseOptions,
);

/* Export for training reads exactly this: approved items in one split. */
datasetItemSchema.index({ split: 1, reviewStatus: 1 });
datasetItemSchema.index({ inputForm: 1, reviewStatus: 1 });
datasetItemSchema.index({ 'provenance.lineageId': 1 });

export type DatasetItemDoc = DatasetItemRecord;
export const DatasetItem = model('DatasetItem', datasetItemSchema, 'dataset_items');

export interface ReviewRecordEntry {
  datasetItemId: Types.ObjectId;
  reviewerStaffId: Types.ObjectId;
  decision: ReviewDecision;
  naturalness?: number;
  dialectCorrectness?: number;
  meaningPreserved?: number;
  correctedText?: string;
  errorTags: string[];
  note?: string;
}

const reviewRecordSchema = new Schema<ReviewRecordEntry>(
  {
    datasetItemId: { type: Schema.Types.ObjectId, ref: 'DatasetItem', required: true, index: true },
    reviewerStaffId: { type: Schema.Types.ObjectId, ref: 'StaffUser', required: true },
    decision: { type: String, enum: ['approved', 'corrected', 'rejected'], required: true },

    /** The rubric from `arabic-data.md`, 1–5 each. */
    naturalness: { type: Number, min: 1, max: 5 },
    dialectCorrectness: { type: Number, min: 1, max: 5 },
    meaningPreserved: { type: Number, min: 1, max: 5 },

    correctedText: longText,
    errorTags: { type: [{ type: String, maxlength: 40 }], default: [] },
    note: { type: String, maxlength: 2000 },
  },
  baseOptions,
);

/* One review per reviewer per item: two reviewers, no double-voting. */
reviewRecordSchema.index({ datasetItemId: 1, reviewerStaffId: 1 }, { unique: true });

export type ReviewRecordDoc = ReviewRecordEntry;
export const ReviewRecord = model('ReviewRecord', reviewRecordSchema, 'review_records');
