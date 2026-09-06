const PING_WEBHOOK_URL = process.env.PING_WEBHOOK_URL || 'https://chat.devop.my.id/api/webhook/notify';
const PING_WEBHOOK_TOKEN = process.env.PING_WEBHOOK_TOKEN || 'pvc-webhook-7f5ac3655bdcd34cd19e8bddd49e0c8f';
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || 'bob@provaliantgroup.com').toLowerCase().split(',').map(e => e.trim());

interface PendingOTP {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

// In-memory store for pending OTP sessions (temporary 5-min lifespan)
const pendingOTPs = new Map<string, PendingOTP>();

export function isEmailAllowed(email: string): boolean {
  return ALLOWED_EMAILS.includes(email.toLowerCase().trim());
}

export async function sendPingOTP(challengeId: string, email: string): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!isEmailAllowed(normalizedEmail)) {
    return { success: false, error: 'Email is not authorized to access Forge.' };
  }

  // Generate random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  pendingOTPs.set(challengeId, {
    email: normalizedEmail,
    code,
    expiresAt,
    attempts: 0
  });

  try {
    const res = await fetch(PING_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PING_WEBHOOK_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userEmail: normalizedEmail,
        title: '🔐 Forge Login Code',
        text: `Your Forge login verification code is: **${code}**\n\nThis code is valid for 5 minutes.`,
        source: 'Forge Auth'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to send Ping webhook:', errText);
      return { success: false, error: 'Failed to deliver login code to Ping chat.' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Ping webhook network error:', err);
    return { success: false, error: 'Network error communicating with Ping webhook.' };
  }
}

export function verifyPingOTP(challengeId: string, inputCode: string): { valid: boolean; email?: string; reason?: string } {
  const record = pendingOTPs.get(challengeId);
  if (!record) {
    return { valid: false, reason: 'Verification session expired or not found. Please enter your email again.' };
  }

  if (Date.now() > record.expiresAt) {
    pendingOTPs.delete(challengeId);
    return { valid: false, reason: 'Verification code has expired. Please request a new code.' };
  }

  record.attempts++;
  if (record.attempts > 5) {
    pendingOTPs.delete(challengeId);
    return { valid: false, reason: 'Too many incorrect attempts. Please enter your email again.' };
  }

  if (record.code !== inputCode.trim()) {
    return { valid: false, reason: 'Incorrect verification code. Please check your Ping chat.' };
  }

  const userEmail = record.email;
  pendingOTPs.delete(challengeId);
  return { valid: true, email: userEmail };
}
