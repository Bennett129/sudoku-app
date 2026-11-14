"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Step = "email" | "code";

const RESEND_COOLDOWN = 30; // seconds

/**
 * Two-step email sign-in: enter email → enter the 6-digit code we send.
 * Signed in: shows the account and a sign-out button.
 */
export function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="account-title"
      className="frost m-auto w-[min(92vw,24rem)] rounded-2xl p-0 text-ink backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="account-title" className="text-lg font-semibold">
            {session ? "Account" : "Sign in"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-key">
            Close
          </button>
        </div>
        {/* Remount the form each time the dialog opens so it starts fresh. */}
        {open && (session ? <SignedIn email={session.user.email} onDone={onClose} /> : <SignInForm onDone={onClose} />)}
      </div>
    </dialog>
  );
}

function SignedIn({ email, onDone }: { email: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="text-sm text-ink-muted">
        Signed in as <span className="font-medium break-all text-ink">{email}</span>
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await authClient.signOut();
          setBusy(false);
          onDone();
        }}
        className="rounded-xl bg-key py-2.5 font-medium hover:bg-key-hover disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    setStep("code");
    setCode("");
    setCooldown(RESEND_COOLDOWN);
  };

  const verify = async (otp: string) => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp });
    setBusy(false);
    if (error) {
      setCode("");
      return setError(friendlyError(error));
    }
    onDone();
  };

  if (step === "email") {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void sendCode();
        }}
      >
        <p className="text-sm text-ink-muted">
          No password needed. We&apos;ll email you a 6-digit code. Signing in is optional.
        </p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoFocus
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl bg-key px-3 py-2.5 text-base font-normal text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent"
            placeholder="you@example.com"
          />
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <SubmitButton busy={busy}>Email me a code</SubmitButton>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) void verify(code);
      }}
    >
      <p className="text-sm text-ink-muted">
        Enter the code sent to <span className="font-medium break-all text-ink">{email}</span>. It expires in 10
        minutes.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Code
        <input
          type="text"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (next.length === 6 && !busy) void verify(next); // submit as soon as it's complete
          }}
          className="rounded-xl bg-key px-3 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-ink outline-none focus:ring-2 focus:ring-accent"
          aria-describedby="code-help"
        />
      </label>
      {error && <ErrorText>{error}</ErrorText>}
      <SubmitButton busy={busy}>Sign in</SubmitButton>
      <div id="code-help" className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setError(null);
          }}
          className="text-ink-muted underline"
        >
          Use a different email
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || busy}
          onClick={() => void sendCode()}
          className="text-ink-muted underline disabled:no-underline disabled:opacity-60"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="rounded-xl bg-accent py-2.5 font-medium text-accent-ink transition active:scale-[0.98] disabled:opacity-60"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm font-medium text-[var(--error)]">
      {children}
    </p>
  );
}

function friendlyError(error: { code?: string; status?: number; message?: string }): string {
  switch (error.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check the email and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Request a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Request a new code.";
    case "INVALID_EMAIL":
      return "Please enter a valid email address.";
  }
  if (error.status === 429) return "Too many requests. Wait a minute and try again.";
  return error.message || "Something went wrong. Please try again.";
}
