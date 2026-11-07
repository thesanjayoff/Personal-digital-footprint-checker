import nodemailer from "nodemailer";

export interface SendResult {
  delivered: boolean;
  mode: "smtp" | "local-display";
}

/**
 * Sends the ownership-verification code by email if SMTP env vars are
 * configured (SMTP_HOST/PORT/USER/PASS/FROM). Without SMTP configured,
 * the app is running purely for its single local user, so the code is
 * simply returned to the caller to display in the UI instead of being
 * silently unreachable. This still proves nothing about ownership of a
 * *different* mailbox than the one the local user is operating — it's a
 * local dev/convenience fallback, documented as such in the README.
 */
export async function sendVerificationCode(toEmail: string, code: string): Promise<SendResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return { delivered: false, mode: "local-display" };
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transport.sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    to: toEmail,
    subject: "Your Digital Footprint Checker verification code",
    text: `Your ownership verification code is: ${code}\n\nEnter it in the app to confirm you control this email address. It expires in 30 minutes.`,
  });
  return { delivered: true, mode: "smtp" };
}
