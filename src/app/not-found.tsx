import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <p className="h-display text-7xl font-black text-brand">404</p>
      <p className="mt-2 text-lg">Game over: this page doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-6">Back to the arcade</Link>
    </div>
  );
}
