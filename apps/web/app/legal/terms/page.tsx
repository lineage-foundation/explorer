import { PageHeader } from "../../components/PageHeader.js";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export const metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Legal" title="Terms of Use" />
      <div className="space-y-4 text-text-muted">
        <p>
          The {TOKEN_DISPLAY_NAME} Explorer is provided as-is for informational purposes. On-chain data is presented
          without warranty of completeness or accuracy.
        </p>
        <p>By using this service you agree not to misuse it or attempt to disrupt its operation.</p>
      </div>
    </div>
  );
}
