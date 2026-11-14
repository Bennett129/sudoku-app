import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "Sudoku <onboarding@resend.dev>";
const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Send a sign-in code. Without RESEND_API_KEY (local dev) the code is
 * printed to the server console instead, so no email account is needed.
 */
export async function sendSignInCode(email: string, code: string): Promise<void> {
  if (!resend) {
    console.info(`\n[auth] Sign-in code for ${email}: ${code}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from,
    to: email,
    // Code first in the subject so it shows in notifications and phones can autofill it.
    subject: `${code} is your Sudoku sign-in code`,
    text: `Your Sudoku sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#29261d">
  <h1 style="font-size:18px;margin:0 0 16px">Your Sudoku sign-in code</h1>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${code}</p>
  <p style="font-size:14px;color:#5f5a4c;margin:0">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
</div>`,
  });
  if (error) console.error("[auth] Failed to send sign-in code:", error.message);
}
