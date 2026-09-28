export default function Privacy() {
  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <h1>How we handle your data and keys</h1>
      <div className="card stack">
        <h2>Your AI key</h2>
        <p style={{ margin: 0 }}>You choose where it lives when you connect.</p>
        <dl className="kv">
          <dt>Encrypted on our server</dt><dd>Stored in our database as ciphertext (AES-256-GCM). The encryption key sits in our hosting provider's secret settings, not in the database, so a copy of the database alone can't reveal your key. Works on every device you sign in from.</dd>
          <dt>Only in this browser</dt><dd>We keep nothing but the last four characters. The key is encrypted inside your browser and sent to our server over HTTPS only while a request runs, then discarded. You'll need to enter it again on each new device.</dd>
        </dl>
        <p className="hint">In both cases the key is never written to logs, analytics or error messages, and we never show it back to you. OpenAI and Anthropic don't offer third-party sign-in that bills your account, so for them a key is the only official way. Google sign-in for Gemini is planned.</p>
      </div>
      <div className="card stack">
        <h2>Your content</h2>
        <p style={{ margin: 0 }}>Roles, contacts, notes, pasted profiles and AI drafts are stored in your account and only you can read them (enforced by the database, not just the app). Pasted profile text is sent to your AI provider to answer your request and is not stored by us afterwards. You can export everything or delete it from Profile &amp; privacy.</p>
      </div>
      <div className="card stack">
        <h2>Product analytics</h2>
        <p style={{ margin: 0 }}>We record events such as "provider connected" or "AI request completed" with the provider, model, time taken, token counts and success. Each event carries a one-way hashed id, not your email. The database refuses any value that isn't a short code, so a prompt, note or name can't end up there even by mistake. You can switch analytics off in Profile &amp; privacy.</p>
        <p className="hint">Events we record: provider_connected, provider_disconnected, provider_validation_failed, ai_request_completed, role_created, contact_created, contact_status_changed.</p>
      </div>
    </div>
  );
}
