/* eslint-disable react/no-unescaped-entities */
import CreatorApplyForm from "@/components/adult/CreatorApplyForm";

export const metadata = { title: "Creator application — Swypik After Dark" };

export default function AdultCreatorApplyPage() {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0, color: "#ededed" }}>Creator application</h1>
        <p style={{ color: "#a1a1aa", margin: "8px 0 0" }}>
          Provide your legal details. After submit you will be redirected to Veriff to upload your government ID and complete a short selfie video.
        </p>
      </header>
      <CreatorApplyForm />
    </section>
  );
}
