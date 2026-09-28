import { DocPage } from "@/components/DocPage";
import { config } from "@/lib/config";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <DocPage title="Terms of Service" draft>
      <p>These terms govern your use of {config.appName}. By creating an account you agree to them.</p>
      <h2>1. Accounts</h2>
      <p>You must be at least 13 years old. You&apos;re responsible for activity on your account. Keep your password secret.</p>
      <h2>2. Your content</h2>
      <p>You keep ownership of games and content you publish. You grant {config.appName} a worldwide licence to host, display and distribute them on the service, and to let other users play and, where your chosen licence allows, fork them on the service.</p>
      <h2>3. Contributions</h2>
      <p>When you open a pull request you grant the game&apos;s owner the right to use your changes in that game under its licence. Merged contributors are credited and may receive a share of that game&apos;s creator earnings as set by its owner.</p>
      <h2>4. Creator earnings</h2>
      <p>Earnings are estimates until a payout period closes. We may withhold earnings connected to fraud, fake play, or content that breaks these terms. Payouts require identity and tax verification through our payment provider.</p>
      <h2>5. Subscriptions</h2>
      <p>Pro renews automatically each month until cancelled. You can cancel any time from the Pro page; access continues until the end of the paid period.</p>
      <h2>6. Prohibited content</h2>
      <p>No malware, cryptominers, tracking, content you don&apos;t have rights to, or content that breaks our Community Guidelines.</p>
      <h2>7. Copyright</h2>
      <p>To report infringement, contact our designated DMCA agent at [address]. We respond to valid notices and counter-notices.</p>
      <h2>8. Liability</h2>
      <p>[Disclaimers and limitation of liability to be completed by counsel.]</p>
    </DocPage>
  );
}
