import { useEffect, useState } from "react";
import { useApp } from "./store";
import QuoteList from "./components/QuoteList";
import QuoteEditor from "./components/QuoteEditor";
import SettingsView from "./components/SettingsView";

function SignIn() {
  const signIn = useApp((s) => s.signIn);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="center-screen">
      <form
        className="card signin stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try { await signIn(name, pin); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
        }}
      >
        <h2>Quote Builder</h2>
        <p className="muted">Sign in with your suite name and PIN.</p>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" /></label>
        <label className="field"><span>PIN</span><input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" autoComplete="current-password" /></label>
        {err && <div className="banner bad">{err}</div>}
        <button className="btn primary" disabled={busy}>Sign in</button>
        <a href="/" className="small">← Back to the suite</a>
      </form>
    </div>
  );
}

export default function App() {
  const { status, error, view, go, me, live, toast, boot } = useApp();
  useEffect(() => { void boot(); }, [boot]);

  // Save before the tab closes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useApp.getState().dirty) { void useApp.getState().save(); e.preventDefault(); }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  return (
    <>
      <header className="topbar">
        <a className="suite-link" href="/" title="Back to the JMRC suite">← Suite</a>
        <div className="brand">
          <strong>Quote Builder</strong>
          <span>J.M Robins Construction Ltd.</span>
        </div>
        {status === "ready" && (
          <nav>
            <button className={view === "list" ? "on" : ""} onClick={() => go("list")}>Quotes</button>
            {useApp.getState().quote && <button className={view === "quote" ? "on" : ""} onClick={() => go("quote")}>Current quote</button>}
            {me?.admin && <button className={view === "settings" ? "on" : ""} onClick={() => go("settings")}>Settings</button>}
          </nav>
        )}
        <div className="spacer" />
        {me && <span className="who">{me.name}{me.admin ? " · Admin" : ""}{!live ? " · local mode" : ""}</span>}
      </header>
      <main>
        {status === "loading" && <div className="center-screen muted">Loading…</div>}
        {status === "error" && <div className="banner bad">Couldn't start: {error}</div>}
        {status === "signin" && <SignIn />}
        {status === "ready" && view === "list" && <QuoteList />}
        {status === "ready" && view === "quote" && <QuoteEditor />}
        {status === "ready" && view === "settings" && me?.admin && <SettingsView />}
      </main>
      {toast && <div className={`toast${toast.bad ? " bad" : ""}`}>{toast.text}</div>}
    </>
  );
}
