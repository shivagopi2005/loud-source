import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, maskToken } from '../../src/server/security/encryption';
import { signSessionToken, verifySessionToken, signMediaSessionToken, verifyMediaSessionToken } from '../../src/server/security/jwt';
import { hasPermission, Permission, UserRole } from '../../src/server/security/rbac';

describe('Encryption & Token Security (PRD Section 1.2, 6.2, 20.1)', () => {
  it('encrypts and decrypts secret token correctly using AES-256-GCM', () => {
    const originalToken = 'MTIwNDQ4OTAwMTg5NDI3MzA1OA.Gh81j9.mock_discord_token_payload';
    const encrypted = encryptSecret(originalToken);

    expect(encrypted).not.toBe(originalToken);
    expect(encrypted).toContain('iv');
    expect(encrypted).toContain('tag');
    expect(encrypted).toContain('ciphertext');

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('rejects tampered or corrupted ciphertext', () => {
    const originalToken = 'secret_discord_bot_token';
    const encrypted = encryptSecret(originalToken);
    const parsed = JSON.parse(encrypted);

    // Tamper with ciphertext
    const firstChar = parsed.ciphertext[0];
    parsed.ciphertext = (firstChar === 'a' ? 'b' : 'a') + parsed.ciphertext.slice(1);
    const tampered = JSON.stringify(parsed);

    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('masks token correctly without exposing secret bytes', () => {
    const token = 'MTIwNDQ4OTAwMTg5NDI3MzA1OA.Gh81j9.mock_token';
    const masked = maskToken(token);

    expect(masked.startsWith('MTIw')).toBe(true);
    expect(masked.endsWith('oken')).toBe(true);
    expect(masked).toContain('*****');
    expect(masked).not.toBe(token);
  });
});

describe('JWT Session & Media Session Tokens (PRD Section 5.1, 8.4)', () => {
  it('signs and verifies user session token', () => {
    const payload = {
      userId: 'usr_123',
      discordId: 'discord_456',
      username: 'DiscordOperator',
      avatarUrl: null,
      role: 'operator',
    };

    const token = signSessionToken(payload, '1h');
    const verified = verifySessionToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('usr_123');
    expect(verified?.username).toBe('DiscordOperator');
  });

  it('signs and verifies short-lived media stream tokens', () => {
    const payload = {
      sessionId: 'voice_session_789',
      workspaceId: 'ws_999',
      userId: 'usr_123',
    };

    const mediaToken = signMediaSessionToken(payload);
    const verified = verifyMediaSessionToken(mediaToken);

    expect(verified).not.toBeNull();
    expect(verified?.sessionId).toBe('voice_session_789');
    expect(verified?.type).toBe('media_stream');
  });
});

describe('Role-Based Access Control (PRD Section 3)', () => {
  it('Owner has all critical permissions', () => {
    expect(hasPermission('owner', 'workspace:manage')).toBe(true);
    expect(hasPermission('owner', 'bot:register')).toBe(true);
    expect(hasPermission('owner', 'voice:start')).toBe(true);
    expect(hasPermission('owner', 'voice:emergency_stop')).toBe(true);
    expect(hasPermission('owner', 'message:announce')).toBe(true);
  });

  it('Operator can operate voice and send test messages, but cannot delete workspace', () => {
    expect(hasPermission('operator', 'voice:start')).toBe(true);
    expect(hasPermission('operator', 'voice:emergency_stop')).toBe(true);
    expect(hasPermission('operator', 'message:test')).toBe(true);
    expect(hasPermission('operator', 'workspace:delete')).toBe(false);
    expect(hasPermission('operator', 'bot:register')).toBe(false);
  });

  it('Viewer can only view diagnostics and status', () => {
    expect(hasPermission('viewer', 'diagnostics:view')).toBe(true);
    expect(hasPermission('viewer', 'voice:start')).toBe(false);
    expect(hasPermission('viewer', 'voice:emergency_stop')).toBe(false);
    expect(hasPermission('viewer', 'message:test')).toBe(false);
  });
});
