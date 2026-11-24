import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { savedSession, signIn } from "../cloud";

// Full-page sign-in. Staff use their suite name + PIN (same as the other JMRC
// tools). This tool is staff-only — there are no client sign-ins.
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [name, setName] = useState(savedSession()?.name || "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pinRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (name ? pinRef : nameRef).current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Enter your name");
    if (!pin.trim()) return setError("Enter your PIN");
    setBusy(true);
    setError("");
    try {
      await signIn(name, pin);
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
      setPin("");
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-page">
      <form className="signin-card" onSubmit={submit}>
        <h2>Sign in to Triangle Intake</h2>
        <p className="muted">Use your JMRC suite name and PIN — the same sign-in as the other tools.</p>
        <label className="field">
          <span>Your name</span>
          <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" placeholder="First Last" />
        </label>
        <label className="field">
          <span>PIN</span>
          <input
            ref={pinRef}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6 digits"
          />
        </label>
        {error && <div className="signin-error">{error}</div>}
        <button className="btn-primary" type="submit" disabled={busy}>
          <LogIn size={14} /> {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
