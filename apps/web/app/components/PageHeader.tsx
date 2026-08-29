import { Eyebrow, Heading } from "@explorer/ui";

export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 border-l-[3px] border-accent pl-4">
      <div className="mb-1">
        <Eyebrow>{eyebrow}</Eyebrow>
      </div>
      <Heading level={1}>{title}</Heading>
    </div>
  );
}
