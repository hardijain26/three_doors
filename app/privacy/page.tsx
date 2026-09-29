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
        <p className="hint">In both cases the key is never written to logs, analytics or error messages, and we never show it back to you. OpenAI and Anthropic don't offer third-party sign-in that bills your account, so for them a key is the official way to connect. Google sign-in for Gemini is planned.</p>
      </div>
      <div className="card stack">
        <h2>Your content</h2>
        <p style={{ margin: 0 }}>Your saved profile, career path, CVs and CV versions, roles and contacts, openings, job sources, search runs, search settings and other account data are stored in the Three Doors Supabase database and associated with your authenticated account. Database row-level security restricts user-owned records to that account. We do not mean that each user gets a separate Supabase project.</p>
        <p style={{ margin: 0 }}>When you paste text for an AI request, it is sent to the AI provider you selected so it can answer your request. Temporary request input is not retained by Three Doors as a standalone prompt after the request. Saved profile or CV data is different: if you choose to save it, it remains in your account until you export or delete it.</p>
        <p className="hint">Three Doors does not use your content as product analytics. Your AI provider may have its own data-handling terms, so check the provider's policy for the account or API key you use.</p>
      </div>
      <div className="card stack">
        <h2>Product analytics</h2>
        <p style={{ margin: 0 }}>We record limited product events such as "provider connected" or "AI request completed" with the provider, model, timing, token counts and success. Each event carries a one-way identifier rather than your email. The telemetry schema accepts short predefined values rather than arbitrary prompt, note or profile content. You can switch analytics off in Profile &amp; privacy.</p>
        <p className="hint">Events include provider_connected, provider_disconnected, provider_validation_failed, ai_request_completed, role_created, contact_created and contact_status_changed.</p>
      </div>
      <div className="card stack">
        <h2>Export and deletion</h2>
        <p style={{ margin: 0 }}>Profile &amp; privacy lets you download the saved account data currently available for export and delete saved application data and stored AI credentials. Deletion signs you out and keeps the authentication account itself; anonymous telemetry is not linked to your email.</p>
      </div>
    </div>
  );
}
