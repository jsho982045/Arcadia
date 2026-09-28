import { DocPage } from "@/components/DocPage";

export const metadata = { title: "Community Guidelines" };

export default function Guidelines() {
  return (
    <DocPage title="Community Guidelines">
      <p>Keep it fun, fair and safe for a young audience.</p>
      <h2>Games</h2>
      <ul>
        <li>Only publish games you made or have the right to publish. No clones using someone else&apos;s art, music or names.</li>
        <li>No sexual content, graphic gore, hate, harassment or real-world violence.</li>
        <li>No malware, miners, trackers, or attempts to break out of the sandbox.</li>
        <li>No fake play, bots or schemes to inflate play time. It forfeits earnings.</li>
      </ul>
      <h2>Collaboration</h2>
      <ul>
        <li>Be kind in reviews and comments. Critique the code, not the person.</li>
        <li>Keep pull requests focused: one fix or feature each.</li>
        <li>Owners: close pull requests you won&apos;t merge with a short reason.</li>
      </ul>
      <h2>Enforcement</h2>
      <p>Moderators may remove content, reject games, withhold earnings or suspend accounts that break these rules.</p>
    </DocPage>
  );
}
