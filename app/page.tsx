import Link from "next/link";
export default function Home() {
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <h1>Three Doors</h1>
      <p>Every job you go after gets three people: the hiring manager, a recruiter, and someone in another team who can refer you. Three Doors tracks each one and drafts the messages.</p>
      <div className="card stack">
        <h2>Your AI bill stays yours. Your data stays yours.</h2>
        <p style={{ margin: 0 }}>You connect your own OpenAI, Claude or Gemini key, so AI usage is billed to your account, not ours. Your roles, contacts and notes are yours to export or delete. We only record product events like "a note was drafted" with the model and timing, never what was written.</p>
        <div className="row"><Link className="btn primary" href="/login">Get started</Link><Link className="btn" href="/privacy">How we handle data</Link></div>
      </div>
    </div>
  );
}
