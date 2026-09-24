import { useEffect, useRef, useState } from "react";
import { LogIn } from "lucide-react";
import { savedSession, signIn } from "../cloud";

// Full-page sign-in for the online app. Staff use their Vendor Orders name + PIN;
// clients use the name + PIN Robins Interiors & Design gave them. A client's
// share link carries their name (?name=…), so they only type the PIN.
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const fromLink = new URLSearchParams(location.search).get("name") || "";
  const [name, setName] = useState(fromLink || savedSession()?.name || "");
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
        <h2>Sign in to Finish Selections</h2>
        <p className="muted">
          Enter your name and the PIN Robins Interiors &amp; Design gave you. Staff: use your Vendor Orders PIN.
        </p>
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
