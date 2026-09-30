import Link from "next/link";
import { Icon } from "@/components/icons.tsx";

export default function Home() {
  return (
    <div className="stack-lg">
      <section className="hero">
        <span className="eyebrow">AI-Powered Job Search</span>
        <h1 style={{ fontSize: "3.5rem", lineHeight: 1.1 }}>Land the interview,<br />not just the application.</h1>
        <p className="lead" style={{ fontSize: "1.25rem", maxWidth: 600 }}>
          Stop sending generic messages. Log in with Google, connect your LinkedIn, 
          and let AI personalize your outreach to hiring managers and recruiters 
          for every role you target.
        </p>
        <div className="row">
          <Link className="btn primary" href="/login" style={{ padding: "12px 24px", fontSize: "1.1rem" }}>
            Get started with Google <Icon name="arrow" />
          </Link>
          <Link className="btn" href="/privacy">Privacy & Data</Link>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" style={{ textAlign: "center", marginBottom: 40 }}>The Path to the Interview</h2>
        <div className="steps3">
          <div className="step">
            <span className="n">1</span>
            <h3>One-Click Setup</h3>
            <p className="meta">Sign in with Google. Paste your LinkedIn URL, and our AI instantly builds your professional profile.</p>
          </div>
          <div className="step">
            <span className="n">2</span>
            <h3>Target the Right People</h3>
            <p className="meta">Don't just apply. Find the hiring manager, a recruiter, and a peer to knock on all three doors.</p>
          </div>
          <div className="step">
            <span className="n">3</span>
            <h3>Hyper-Personalize</h3>
            <p className="meta">Generate outreach drafts based on your actual achievements and the company's specific needs.</p>
          </div>
        </div>
      </section>

      <section className="card stack-lg" aria-labelledby="trust">
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h2 id="trust">Professional Grade. Privacy First.</h2>
          <p className="meta">Built for serious job seekers who value their data and their time.</p>
        </div>
        <div className="trust">
          <div className="item">
            <span className="ic"><Icon name="wallet" /></span>
            <div>
              <h3>Your AI, Your Bill</h3>
              <p className="meta">Connect OpenAI, Claude, or Gemini. You pay the provider directly; we never take a cut.</p>
            </div>
          </div>
          <div className="item">
            <span className="ic"><Icon name="lock" /></span>
            <div>
              <h3>Vault-Grade Security</h3>
              <p className="meta">Your keys are encrypted on our server or stored exclusively in your browser. You decide.</p>
            </div>
          </div>
          <div className="item">
            <span className="ic"><Icon name="download" /></span>
            <div>
              <h3>Full Data Ownership</h3>
              <p className="meta">Export your roles, contacts, and notes in one click. Delete everything instantly if you choose.</p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link className="btn primary" href="/login" style={{ padding: "12px 24px" }}>
            Create your account with Google <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </div>
  );
}
