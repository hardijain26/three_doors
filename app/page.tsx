import Link from "next/link";
import { Icon } from "@/components/icons.tsx";

export default function Home() {
  return (
    <div className="stack-lg">
      <section className="hero">
        <span className="eyebrow">Job-search outreach</span>
        <h1>Every role has three doors. Knock on all of them.</h1>
        <p className="lead">For each job you want, reach the hiring manager, a recruiter, and someone in another team who can refer you. Three Doors tracks every person, tells you what to do next, and drafts the messages with your own AI.</p>
        <div className="row"><Link className="btn primary" href="/login">Get started free <Icon name="arrow" /></Link><Link className="btn" href="/privacy">How we handle data</Link></div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <div className="steps3">
          <div className="step"><span className="n">1</span><h3>Add the role</h3><p className="meta">Company, title and the job post. One card per job you're serious about.</p></div>
          <div className="step"><span className="n">2</span><h3>Find the three people</h3><p className="meta">Search LinkedIn from the card, paste their profile, and get the points you have in common.</p></div>
          <div className="step"><span className="n">3</span><h3>Move each one forward</h3><p className="meta">Connection note, follow-up, coffee chat, referral. The next step turns red when it's due.</p></div>
        </div>
      </section>

      <section className="card stack-lg" aria-labelledby="trust">
        <div><h2 id="trust">Your AI bill stays yours. Your data stays yours.</h2><p className="meta">We only record product events like "a note was drafted", with the model and timing. Never what was written.</p></div>
        <div className="trust">
          <div className="item"><span className="ic"><Icon name="wallet" /></span><div><h3>Your own AI key</h3><p className="meta">Connect OpenAI, Claude or Gemini. Usage is billed to your account, not ours.</p></div></div>
          <div className="item"><span className="ic"><Icon name="lock" /></span><div><h3>You choose where it lives</h3><p className="meta">Encrypted on our server, or only in your browser.</p></div></div>
          <div className="item"><span className="ic"><Icon name="download" /></span><div><h3>Export or delete anytime</h3><p className="meta">Only you can read your roles, contacts and notes.</p></div></div>
        </div>
        <div><Link className="btn primary" href="/login">Create your account <Icon name="arrow" /></Link></div>
      </section>
    </div>
  );
}
