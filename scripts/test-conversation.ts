/**
 * Test script: simulate a WhatsApp onboarding conversation by calling the
 * session state machine directly (no real WhatsApp credentials needed).
 *
 * Run:
 *   cd /Users/lending/WhatsAds && npx tsx scripts/test-conversation.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// 1. Load .env before any package imports that may read process.env
// ---------------------------------------------------------------------------

function loadDotEnv(envPath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch {
    console.error(`Could not read ${envPath} — continuing with existing env`);
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(path.resolve('/Users/lending/WhatsAds/.env'));

// ---------------------------------------------------------------------------
// 2. Imports (after env is set so Prisma picks up DATABASE_URL)
// ---------------------------------------------------------------------------

import { handleIncomingMessage, ButtonIds, ListIds } from '@whatsads/session';
import type { MessageContext } from '@whatsads/session';
import type { WhatsAppClient } from '@whatsads/whatsapp';
import type { SendMessageResponse, SendTemplatePayload } from '@whatsads/whatsapp/src/types.js';
import { prisma } from '@whatsads/db';

// ---------------------------------------------------------------------------
// 3. Mock WhatsAppClient — logs all calls, returns a fake success response
// ---------------------------------------------------------------------------

const MOCK_RESPONSE: SendMessageResponse = {
  messaging_product: 'whatsapp',
  contacts: [{ input: 'test', wa_id: 'test' }],
  messages: [{ id: 'mock-msg-id' }],
};

function label(method: string): string {
  return `  [BOT -> ${method.toUpperCase()}]`;
}

function printButtons(buttons: Array<{ id: string; title: string }>): void {
  buttons.forEach((b, i) => {
    console.log(`      Button ${i + 1}: "${b.title}" (id: ${b.id})`);
  });
}

function printList(
  sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
): void {
  sections.forEach((section) => {
    console.log(`      Section: "${section.title}"`);
    section.rows.forEach((row, i) => {
      const desc = row.description ? ` -- ${row.description}` : '';
      console.log(`        Row ${i + 1}: "${row.title}"${desc} (id: ${row.id})`);
    });
  });
}

const mockWhatsAppClient: WhatsAppClient = {
  async sendText(to: string, body: string): Promise<SendMessageResponse> {
    console.log(`${label('sendText')} to: ${to}`);
    console.log(`      Message: "${body}"`);
    return MOCK_RESPONSE;
  },

  async sendImage(to: string, imageUrl: string, caption?: string): Promise<SendMessageResponse> {
    console.log(`${label('sendImage')} to: ${to}`);
    console.log(`      URL:     ${imageUrl}`);
    if (caption) console.log(`      Caption: "${caption}"`);
    return MOCK_RESPONSE;
  },

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<SendMessageResponse> {
    console.log(`${label('sendButtons')} to: ${to}`);
    console.log(`      Body: "${body}"`);
    printButtons(buttons);
    return MOCK_RESPONSE;
  },

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<SendMessageResponse> {
    console.log(`${label('sendList')} to: ${to}`);
    console.log(`      Body:       "${body}"`);
    console.log(`      ButtonText: "${buttonText}"`);
    printList(sections);
    return MOCK_RESPONSE;
  },

  async sendPaymentLink(
    to: string,
    body: string,
    url: string,
    buttonText: string,
  ): Promise<SendMessageResponse> {
    console.log(`${label('sendPaymentLink')} to: ${to}`);
    console.log(`      Body:       "${body}"`);
    console.log(`      URL:        ${url}`);
    console.log(`      ButtonText: "${buttonText}"`);
    return MOCK_RESPONSE;
  },

  async markAsRead(messageId: string): Promise<void> {
    console.log(`${label('markAsRead')} messageId: ${messageId}`);
  },

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: SendTemplatePayload['template']['components'],
  ): Promise<SendMessageResponse> {
    console.log(`${label('sendTemplate')} to: ${to}`);
    console.log(`      Template:  ${templateName}`);
    console.log(`      Language:  ${languageCode}`);
    if (components) console.log(`      Components:`, JSON.stringify(components, null, 2));
    return MOCK_RESPONSE;
  },
} as unknown as WhatsAppClient;

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

const TEST_PHONE = '919876543210';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function separator(stepNum: number, description: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`=== STEP ${stepNum}: ${description}`);
  console.log('='.repeat(60));
}

async function sendStep(
  stepNum: number,
  description: string,
  msg: MessageContext,
): Promise<void> {
  separator(stepNum, description);
  const parts = [
    `messageType=${msg.messageType}`,
    msg.text ? `text="${msg.text}"` : null,
    msg.buttonReplyId ? `buttonReplyId=${msg.buttonReplyId}` : null,
    msg.listReplyId ? `listReplyId=${msg.listReplyId}` : null,
  ].filter(Boolean).join(', ');
  console.log(`  [USER] ${parts}`);
  console.log('  --- bot response ---');
  await handleIncomingMessage(TEST_PHONE, msg, mockWhatsAppClient);
  await delay(1000);
}

// ---------------------------------------------------------------------------
// 5. Database setup — seed user + session so all transitionTo calls go UPDATE
// ---------------------------------------------------------------------------

async function setupTestDatabase(): Promise<void> {
  console.log('Setting up test database...');

  // Clean slate: remove any existing test data for this phone number
  // Order matters due to foreign key constraints
  const existingSession = await prisma.session.findUnique({ where: { phoneNumber: TEST_PHONE } });
  if (existingSession) {
    await prisma.session.delete({ where: { phoneNumber: TEST_PHONE } });
    console.log('  Deleted existing session');
  }

  // Clean up processed messages from previous test runs
  await prisma.processedMessage.deleteMany({
    where: {
      messageId: {
        in: ['test-msg-1','test-msg-2','test-msg-3','test-msg-4','test-msg-5','test-msg-6','test-msg-7'],
      },
    },
  });
  console.log('  Cleaned processed message idempotency records');

  const existingUser = await prisma.user.findUnique({ where: { phoneNumber: TEST_PHONE } });
  let userId: string;

  if (existingUser) {
    // Reset user to new-user state so onboarding triggers correctly
    await prisma.user.update({
      where: { phoneNumber: TEST_PHONE },
      data: { name: null, businessType: null, language: 'hi', stylePreference: null },
    });
    userId = existingUser.id;
    console.log('  Reset existing user to new-user state, id:', userId);
  } else {
    const user = await prisma.user.create({
      data: { phoneNumber: TEST_PHONE, language: 'hi' },
    });
    userId = user.id;
    console.log('  Created new test user, id:', userId);
  }

  // Pre-create the session in IDLE state so every transitionTo goes UPDATE path.
  // This sidesteps the db-helpers bug where the CREATE fallback uses userId: ''.
  await prisma.session.create({
    data: {
      phoneNumber: TEST_PHONE,
      state: 'IDLE',
      userId,
      stateEnteredAt: new Date(),
      lastUserMessageAt: new Date(),
      cswExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  console.log('  Created IDLE session');
  console.log('Database ready.\n');
}

// ---------------------------------------------------------------------------
// 6. Conversation simulation
// ---------------------------------------------------------------------------

async function runConversation(): Promise<void> {
  console.log('WhatsAds -- Test Conversation Simulator');
  console.log('Phone:', TEST_PHONE);
  console.log('Database URL:', (process.env['DATABASE_URL'] ?? '').slice(0, 50) + '...');
  console.log();

  await setupTestDatabase();

  // Step 1: User sends "Hi" -- new user, no name, should trigger onboarding welcome
  await sendStep(1, 'User sends "Hi"', {
    messageId: 'test-msg-1',
    messageType: 'text',
    text: 'Hi',
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 2: User taps "Hindi mein" button -- sets language to Hindi
  await sendStep(2, 'User taps "Hindi mein" button', {
    messageId: 'test-msg-2',
    messageType: 'interactive',
    buttonReplyId: ButtonIds.LANG_HINDI,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 3: User types their name "Sunita"
  // (handleOnboardingWelcome transitions directly to ONBOARDING_NAME after lang pick)
  await sendStep(3, 'User types "Sunita" (name input)', {
    messageId: 'test-msg-3',
    messageType: 'text',
    text: 'Sunita',
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 4: User selects Jewellery from the category list
  await sendStep(4, 'User selects "Jewellery / Accessories" from category list', {
    messageId: 'test-msg-4',
    messageType: 'interactive',
    listReplyId: ListIds.CAT_JEWELLERY,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 5: User taps "Theek hai" to accept consent
  await sendStep(5, 'User taps "Theek hai" consent button', {
    messageId: 'test-msg-5',
    messageType: 'interactive',
    buttonReplyId: ButtonIds.CONSENT_OK,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Step 6: Bonus — simulate returning user flow by resetting session to IDLE,
  // then sending a greeting. The bot should recognise Sunita and show the
  // returning-user welcome with "Haan, naya photo" / "Bas dekhne aaya" buttons.
  await prisma.session.update({ where: { phoneNumber: TEST_PHONE }, data: { state: 'IDLE' } });
  console.log('  [TEST SETUP] Reset session to IDLE to simulate returning user');
  await sendStep(6, 'Returning user sends "Namaste" (should see welcome-back buttons)', {
    messageId: 'test-msg-6',
    messageType: 'text',
    text: 'Namaste',
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Show final session state
  const finalSession = await prisma.session.findUnique({ where: { phoneNumber: TEST_PHONE } });
  const finalUser = await prisma.user.findUnique({ where: { phoneNumber: TEST_PHONE } });

  console.log('\n' + '='.repeat(60));
  console.log('=== CONVERSATION COMPLETE');
  console.log('='.repeat(60));
  console.log('Final session state:', finalSession?.state);
  console.log('Final user name:', finalUser?.name);
  console.log('Final user language:', finalUser?.language);
  console.log('Final user businessType:', finalUser?.businessType);
  console.log();
  if (finalSession?.state === 'AWAITING_IMAGES') {
    console.log('SUCCESS: User is now in AWAITING_IMAGES state, ready to receive product photos.');
  } else {
    console.log('NOTE: Final state is', finalSession?.state, '-- check flow above for details.');
  }
}

// ---------------------------------------------------------------------------
// 7. Entry point
// ---------------------------------------------------------------------------

runConversation()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nFATAL ERROR:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
