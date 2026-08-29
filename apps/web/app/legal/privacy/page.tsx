import { PageHeader } from "../../components/PageHeader.js";
import { TOKEN_DISPLAY_NAME } from "@explorer/config";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Legal" title="Privacy Policy" />
      <div className="space-y-4 text-text-muted">
        <p>
          The {TOKEN_DISPLAY_NAME} Explorer displays public on-chain data. It does not require accounts and does not
          collect personal information beyond standard, anonymized request logs used to operate the service.
        </p>
        <p>
          Blockchain data shown here is public and immutable. Searches are processed to return the requested block,
          transaction, or address and are not linked to personal identity.
        </p>
      </div>
    </div>
  );
}
