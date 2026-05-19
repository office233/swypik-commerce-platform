/* eslint-disable react/no-unescaped-entities */
import UploadForm from "@/components/adult/UploadForm";

export const metadata = { title: "Upload — Swypik After Dark" };

export default function AdultUploadPage() {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 28, margin: 0, color: "#ededed" }}>Upload a new post</h1>
        <p style={{ color: "#a1a1aa", margin: "8px 0 0" }}>
          You must attach at least one consent release confirming every performer is 18+ and has agreed to publication.
        </p>
      </header>
      <UploadForm />
    </section>
  );
}
