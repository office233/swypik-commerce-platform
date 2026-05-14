import * as OTPAuth from "otpauth";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const ISSUER = "Swypik";

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function getOtpAuthUrl(secret: string, email: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: token.replace(/\s/g, ""), window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
}

export async function consumeBackupCode(hashedList: string[], submitted: string): Promise<{ matched: boolean; remaining: string[] }> {
  const clean = submitted.replace(/\s/g, "").toUpperCase();
  for (let i = 0; i < hashedList.length; i++) {
    if (await bcrypt.compare(clean, hashedList[i])) {
      const remaining = hashedList.filter((_, idx) => idx !== i);
      return { matched: true, remaining };
    }
  }
  return { matched: false, remaining: hashedList };
}
