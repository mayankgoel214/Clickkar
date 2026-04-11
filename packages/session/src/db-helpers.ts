/**
 * Thin wrappers around Prisma for session/user operations.
 * All state transitions go through transitionTo() to ensure atomicity.
 */

import { prisma } from '@whatsads/db';
import type { Session, User } from '@whatsads/db';
import type { ConversationState } from './types.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the session for a phone number, or null if none exists.
 */
export async function getSession(phoneNumber: string): Promise<Session | null> {
  return prisma.session.findUnique({ where: { phoneNumber } });
}

/**
 * Atomically update the session state and any extra fields.
 * Creates the session row if it does not yet exist (requires userId).
 */
export async function transitionTo(
  phoneNumber: string,
  newState: ConversationState,
  extraFields?: Partial<{
    currentOrderId: string | null;
    styleSelection: string | null;
    voiceInstructions: string | null;
    imageMediaIds: string[];
    imageStorageUrls: string[];
    lastUserMessageAt: Date;
    stateEnteredAt: Date;
    cswExpiresAt: Date;
    userId: string;
  }>,
): Promise<Session> {
  const now = new Date();
  const data = {
    state: newState,
    stateEnteredAt: now,
    ...extraFields,
  };

  // Resolve userId for the CREATE branch: use the caller-supplied value, or look
  // up the existing session's userId so subsequent transitionTo calls (which
  // don't pass userId) never fall back to an empty string.
  let resolvedUserId = extraFields?.userId;
  if (!resolvedUserId) {
    const existing = await prisma.session.findUnique({
      where: { phoneNumber },
      select: { userId: true },
    });
    resolvedUserId = existing?.userId;
  }

  if (!resolvedUserId) {
    const err = new Error(`transitionTo: cannot create session for ${phoneNumber} without a userId`);
    logger.error('transitionTo failed — no userId', { phoneNumber, newState });
    throw err;
  }

  try {
    return await prisma.session.upsert({
      where: { phoneNumber },
      update: data,
      create: {
        phoneNumber,
        state: newState,
        stateEnteredAt: now,
        userId: resolvedUserId,
        ...extraFields,
      },
    });
  } catch (err) {
    logger.error('transitionTo failed', {
      phoneNumber,
      newState,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// @deprecated — unused, consider removing
/**
 * Touch session timing fields on every inbound message.
 * Does NOT change state.
 */
export async function touchSession(phoneNumber: string): Promise<void> {
  const now = new Date();
  const cswExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
  await prisma.session.update({
    where: { phoneNumber },
    data: { lastUserMessageAt: now, cswExpiresAt },
  });
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a User record by phone number.
 * On creation the language defaults to 'hi'.
 */
export async function getOrCreateUser(phoneNumber: string): Promise<User> {
  return prisma.user.upsert({
    where: { phoneNumber },
    update: { lastSeenAt: new Date() },
    create: { phoneNumber, language: 'hi' },
  });
}

// @deprecated — unused, consider removing
export async function getUser(phoneNumber: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { phoneNumber } });
}

export async function updateUser(
  phoneNumber: string,
  data: Partial<{
    name: string;
    language: string;
    businessType: string;
    stylePreference: string;
    lastStyleUsed: string;
    styleHistory: Record<string, number>;
    orderCount: number;
  }>,
): Promise<User> {
  return prisma.user.update({ where: { phoneNumber }, data });
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * Check if a WhatsApp message ID has already been processed.
 * If not, mark it as processed and return false.
 * If yes, return true.
 */
export async function checkAndMarkProcessed(messageId: string): Promise<boolean> {
  try {
    await prisma.processedMessage.create({ data: { messageId } });
    return false; // New — not yet processed
  } catch (err: unknown) {
    // P2002 = unique constraint violation = duplicate message
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'P2002') {
      return true; // Already processed
    }
    // Any other error is a real DB failure — log and re-throw
    console.error(JSON.stringify({
      event: 'processed_message_check_failed',
      error: err instanceof Error ? err.message : String(err),
    }));
    throw err; // Let the caller handle it
  }
}

// ---------------------------------------------------------------------------
// Session language helper
// ---------------------------------------------------------------------------

// @deprecated — unused, consider removing
/**
 * Resolve the language to use for a phone number.
 * Falls back to 'hi' if no user record exists yet.
 */
export async function getLanguage(phoneNumber: string): Promise<'hi' | 'en'> {
  const user = await prisma.user.findUnique({
    where: { phoneNumber },
    select: { language: true },
  });
  if (!user) return 'hi';
  return user.language === 'en' ? 'en' : 'hi';
}
