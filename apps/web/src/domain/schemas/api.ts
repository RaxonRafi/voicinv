import { z } from 'zod';

import { PLANS, PLATFORMS } from '../constants';
import {
  currencyCodeSchema,
  emailSchema,
  epochMsSchema,
  idSchema,
  languageCodeSchema,
  nameSchema,
  phoneSchema,
} from './common';

// Request and response contracts of the API (AGENTS.md §10), as the website uses them.
// The API itself validates requests with class-validator DTOs that mirror these shapes.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Accounts are identified by a phone number or an email address. */
export const identifierSchema = z.union([phoneSchema, emailSchema]);

export const registerRequestSchema = z.strictObject({
  identifier: identifierSchema,
  password: passwordSchema,
  shop: z.strictObject({
    /** The shop already created on the device keeps its ID when the account is created. */
    id: idSchema,
    name: nameSchema,
    currencyCode: currencyCodeSchema,
    defaultLanguage: languageCodeSchema,
    invoicePrefix: z.string().regex(/^[A-Z0-9]{1,6}$/),
  }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  identifier: identifierSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.strictObject({ refreshToken: z.string().min(1).max(512) });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const recoverRequestSchema = z.strictObject({
  identifier: identifierSchema,
  recoveryCode: z.string().min(1).max(64),
  newPassword: passwordSchema,
});
export type RecoverRequest = z.infer<typeof recoverRequestSchema>;

/** The code just used is spent; this is the new one for the user to write down. */
export const recoverResponseSchema = z.object({ recoveryCode: z.string() });
export type RecoverResponse = z.infer<typeof recoverResponseSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const registerResponseSchema = authTokensSchema.extend({
  userId: idSchema,
  shopId: idSchema,
  /** Shown once. The only way to reset a forgotten password (no SMS or email provider). */
  recoveryCode: z.string(),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const meResponseSchema = z.object({
  user: z.object({ id: idSchema, identifier: z.string(), createdAt: epochMsSchema }),
  shop: z.object({
    id: idSchema,
    name: z.string(),
    currencyCode: z.string(),
    defaultLanguage: z.string(),
    invoicePrefix: z.string(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const registerDeviceRequestSchema = z.strictObject({
  /** The device's own ID, generated on first launch. */
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  platform: z.enum(PLATFORMS),
});
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const deviceResponseSchema = z.object({
  id: idSchema,
  shopId: idSchema,
  deviceCode: z.string().regex(/^[A-Z]{1,3}$/),
  name: z.string(),
  lastSyncAt: epochMsSchema.nullable(),
});
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;

export const waitlistRequestSchema = z
  .strictObject({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    name: z.string().trim().max(120).optional(),
    locale: languageCodeSchema,
    shopType: z.string().trim().max(60).optional(),
    /** Honeypot; must stay empty for real signups. */
    website: z.string().max(200).optional(),
  })
  .refine((value) => value.email !== undefined || value.phone !== undefined, {
    message: 'either email or phone is required',
    path: ['email'],
  });
export type WaitlistRequest = z.infer<typeof waitlistRequestSchema>;

export const STORES = ['google_play', 'app_store'] as const;
export type Store = (typeof STORES)[number];

export const verifyPurchaseRequestSchema = z.strictObject({
  store: z.enum(STORES),
  productId: z.string().min(1).max(200),
  /** Google Play purchase token or App Store transaction ID. */
  purchaseToken: z.string().min(1).max(4000),
});
export type VerifyPurchaseRequest = z.infer<typeof verifyPurchaseRequestSchema>;

export const entitlementSchema = z.object({
  plan: z.enum(PLANS),
  /** When the paid period ends. Null on the free plan. */
  expiresAt: epochMsSchema.nullable(),
  /** When the server produced this answer; the app caches it for offline use. */
  checkedAt: epochMsSchema,
});
export type Entitlement = z.infer<typeof entitlementSchema>;

export const appConfigSchema = z.object({
  /** Oldest app version allowed to sync, as `major.minor.patch`. */
  minSupportedVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  latestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  featureFlags: z.record(z.string(), z.boolean()),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

export const backupMetadataSchema = z.object({
  id: idSchema,
  createdAt: epochMsSchema,
  /** Size of the encrypted blob in bytes. */
  sizeBytes: z.int().min(0),
  /** SHA-256 of the encrypted blob, hex encoded. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  deviceId: idSchema.nullable(),
  /** Backup format version, so old apps do not try to restore newer backups. */
  formatVersion: z.int().min(1),
});
export type BackupMetadata = z.infer<typeof backupMetadataSchema>;

/**
 * Query of `POST /backups`. The body is the encrypted backup file itself
 * (`Content-Type: application/octet-stream`); see `src/shared/backup/format`.
 */
export const backupUploadQuerySchema = z.strictObject({
  /** SHA-256 of the uploaded bytes, hex encoded. The server refuses a body that differs. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  /** The registered device creating the backup. */
  deviceId: idSchema.optional(),
});
export type BackupUploadQuery = z.infer<typeof backupUploadQuerySchema>;

export const backupListSchema = z.array(backupMetadataSchema);

/** Error envelope returned by every API endpoint on failure. */
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
