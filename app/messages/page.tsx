"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons.tsx";
import { useMe, wins } from "@/lib/client/useMe.ts";
import { cap, dot } from "@/lib/client/legacy.js";

export default function Messages() {
  const me = useMe();
  if (!me) return <p className="meta">Loading…</p>;
  const sg = me.first_name || "{your name}", co = me.last_company || "{company}", own = me.owned || "{what you owned}", rl = me.last_role || "PM", w = wins(me);
  const T: [string, string, boolean][] = [
    ["Hiring manager · connection note", `Hi {First}, I'm applying for the {Role} role on your team. At ${co} I ran ${own}${w[0] ? `; ${w[0]}` : ""}. {One line on the part of their product you'd work on}. ${sg}`, true],
    ["Recruiter · connection note", `Hi {First}, I've applied for the {Role} role at {Company}. I was a ${rl} at ${co} (${own})${me.background ? ` and ${me.background} before that` : ""}. ${w[1] ? dot(cap(w[1])) + " " : ""}Happy to send anything that helps. ${sg}`, true],
    ["Other department · connection note", `Hi {First}, your post on {topic} stuck with me, especially {the point}. I hit the same thing at ${co}. I'm looking hard at {Company}'s {Role} role and would value 15 minutes of your view on the team. ${sg}`, true],
    ["Hiring manager · after they accept", `Thanks for connecting, {First}. Why I applied: at ${co} I owned ${own}.${w.length ? " " + dot(cap(w.slice(0, 2).join(", and "))) : ""}\n\nAt {Company} I'd start by digging into {specific problem from the job post}. Happy to walk you through how I'd approach it in 20 minutes.${me.portfolio ? ` Portfolio: ${me.portfolio}` : ""}`, false],
    ["Recruiter · after they accept", `Thanks, {First}. I applied on {date}. Two things that may help the screen: I've run ${own} at ${co}${me.background ? `, and I'm ${me.background} by training` : ""}.\n\nI'm based in ${me.based_in || "{where you live}"} and ready to relocate to {city}. Is there anything the hiring team is weighing that I should address up front?`, false],
    ["Other department · after they accept", `Thanks for connecting, {First}. Two quick questions if you have a minute: what does a good first 90 days look like on {team}, and what does the team argue about most?\n\nIf after that you think I'd fit, I'd be grateful for a referral for {Role}. No pressure either way.`, false],
    ["Anyone · one nudge after 7 days", `Hi {First}, following up once on my note about {Role}. Since then I {one new thing: shipped, wrote or learned}. If the timing's off, no problem.`, false],
  ];
  return (
    <div className="stack-lg">
      <div className="page-head"><div><h1>Messages</h1><p>Templates that fill in from your <Link href="/settings/profile">Profile</Link>. Replace anything in braces before sending.</p></div></div>
      <div className="grid">{T.map(([t, body, note]) => <Tpl key={t} title={t} body={body} note={note} />)}</div>
      <div className="card stack">
        <h2>Order for each role</h2>
        <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Someone in another department first, before you apply. A referral only counts if it comes before your application.</li>
          <li>Apply, through the referral link if you got one.</li>
          <li>Same day: hiring manager note, then recruiter note.</li>
          <li>When someone accepts, send the follow-up that day.</li>
          <li>One nudge after 7 days of silence. Never a second one.</li>
          <li>Withdraw requests still pending after 3 weeks. A big pending pile and a low acceptance rate get accounts throttled.</li>
        </ol>
      </div>
    </div>
  );
}
function Tpl({ title, body, note }: { title: string; body: string; note: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="card stack">
      <div className="row between"><h3>{title}</h3><button onClick={() => navigator.clipboard.writeText(body).then(() => { setDone(true); setTimeout(() => setDone(false), 1400); })}><Icon name={done ? "check" : "copy"} />{done ? "Copied" : "Copy"}</button></div>
      <p className="note">{body}</p>
      {note && <span className={`hint${body.length > 300 ? " due" : ""}`}>{body.length} / 300 characters (placeholders included)</span>}
    </div>
  );
}
