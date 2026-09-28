import Link from "next/link";
import { DocPage } from "@/components/DocPage";
import { config } from "@/lib/config";

export const metadata = { title: "How it works" };

export default function About() {
  return (
    <DocPage title={`How ${config.appName} works`}>
      <p>{config.appName} is a home for browser games that anyone can play, publish and improve. Think of it as an arcade where every game is also an open project.</p>
      <h2>For players</h2>
      <ul>
        <li>Every game runs instantly in your browser, on desktop and mobile.</li>
        <li>Free accounts get {Math.round(config.freeDailySeconds / 60)} minutes of play a day. <Link href="/pro" className="link">Pro</Link> is unlimited.</li>
        <li>Rate games, post scores, save progress, and report bugs or ideas as issues.</li>
      </ul>
      <h2>For creators</h2>
      <ul>
        <li>Upload a zip with an <code>index.html</code>, or start from a template and code in the browser.</li>
        <li>Every upload is checked automatically. New creators&apos; first games are reviewed by a moderator.</li>
        <li>Each release is a numbered version. You can roll back any time.</li>
      </ul>
      <h2>Collaboration: forks and pull requests</h2>
      <ul>
        <li>Anyone can <b>fork</b> a game that allows it: that makes their own copy to change.</li>
        <li>They edit it in the browser, then open a <b>pull request</b>: a suggested change with a playable preview and a line-by-line diff.</li>
        <li>The owner always has the final say. One click merges it and releases a new version.</li>
        <li>Merged contributors are credited on the game and earn contributor points.</li>
      </ul>
      <h2>How the money works</h2>
      <ul>
        <li>{Math.round(config.creatorPoolShare * 100)}% of net Pro subscription revenue goes into a monthly creator pool.</li>
        <li>Each subscriber&apos;s share is split across the games they played, by active minutes (time with the game visible and being played).</li>
        <li>Each game&apos;s earnings are split between the owner and its contributors. The owner sets the contributor share (20% by default), divided by points.</li>
        <li>Payouts are monthly once you pass $25, to creators aged 18+ (or with a parent or guardian&apos;s account).</li>
      </ul>
      <h2>Safety</h2>
      <p>Games run in a sandbox on a separate domain with no network access and no access to your account. Found something wrong? Use the report link on any game.</p>
    </DocPage>
  );
}
