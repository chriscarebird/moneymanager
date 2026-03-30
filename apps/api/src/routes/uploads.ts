import { Hono } from 'hono';
import { z } from 'zod';
import type { ApiResponse } from '@investpilot/core';
import {
  parseDeGiroScreenshot,
  parseMorganStanleyScreenshot,
  parseRSUGrantDocument,
  type ParsedPortfolio,
  type ParsedMSHoldings,
  type ParsedRSUGrant,
} from '@investpilot/ai';
import type { AppVariables } from '../types.js';

export const uploadsRoutes = new Hono<{ Variables: AppVariables }>();

// ── Shared base64 body schema ─────────────────────────────────────────────────

const ImageUploadSchema = z.object({
  /** Base64-encoded image data */
  imageBase64: z.string().min(1),
  /** MIME type of the image */
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

const DocumentUploadSchema = z.object({
  /** Base64-encoded file data */
  fileBase64: z.string().min(1),
  /** MIME type */
  mediaType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
});

/**
 * POST /api/uploads/degiro
 * Parse a DeGiro portfolio screenshot with Claude.
 * Returns structured holdings for user confirmation before saving.
 */
uploadsRoutes.post('/degiro', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = ImageUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const result = await parseDeGiroScreenshot(parsed.data.imageBase64, parsed.data.mediaType);
    const response: ApiResponse<ParsedPortfolio> = { data: result, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parser error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * POST /api/uploads/ms-holdings
 * Parse a Morgan Stanley holdings screenshot with Claude.
 * Returns structured equity positions for user confirmation.
 */
uploadsRoutes.post('/ms-holdings', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = ImageUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const result = await parseMorganStanleyScreenshot(
      parsed.data.imageBase64,
      parsed.data.mediaType,
    );
    const response: ApiResponse<ParsedMSHoldings> = { data: result, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parser error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});

/**
 * POST /api/uploads/rsu-grant
 * Parse an RSU grant document (PDF or image) with Claude.
 * Returns structured grant parameters for user confirmation.
 */
uploadsRoutes.post('/rsu-grant', async (c) => {
  const raw: unknown = await c.req.json();
  const parsed = DocumentUploadSchema.safeParse(raw);
  if (!parsed.success) {
    const response: ApiResponse<null> = {
      data: null,
      error: `Invalid request: ${parsed.error.message}`,
    };
    return c.json(response, 400);
  }

  try {
    const result = await parseRSUGrantDocument(parsed.data.fileBase64, parsed.data.mediaType);
    const response: ApiResponse<ParsedRSUGrant> = { data: result, error: null };
    return c.json(response, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parser error';
    const response: ApiResponse<null> = { data: null, error: message };
    return c.json(response, 500);
  }
});
