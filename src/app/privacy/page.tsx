import { DocPage } from "@/components/DocPage";
import { config } from "@/lib/config";

export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <DocPage title="Privacy Policy" draft>
      <p>This explains what {config.appName} collects and why.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account details: username, email, password (stored as a salted hash).</li>
        <li>Play data: which games you play and for how long, scores, saves. This is how the free-play allowance and creator payouts are calculated.</li>
        <li>Content you post: games, comments, issues, pull requests.</li>
        <li>Billing: handled by Stripe. We never see or store card numbers.</li>
      </ul>
      <h2>What games can see</h2>
      <p>Games run in an isolated sandbox. They cannot read your account, cookies or email, and cannot send data to other websites.</p>
      <h2>Cookies</h2>
      <p>We use a session cookie to keep you signed in and an anonymous cookie to track the free play allowance for signed-out players. No advertising cookies.</p>
      <h2>Your choices</h2>
      <p>You can request a copy or deletion of your data at [contact email].</p>
    </DocPage>
  );
}
