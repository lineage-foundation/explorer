import { Heading } from "@explorer/ui";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="font-mono text-sm uppercase tracking-[0.08em] text-link">404</p>
      <Heading level={1}>Not found</Heading>
      <p className="mt-2 text-text-muted">That block, transaction, or address could not be found. Try the search above.</p>
    </div>
  );
}
