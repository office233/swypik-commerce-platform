/* eslint-disable react/no-unescaped-entities */
export const metadata = { title: "Wellness resources — Swypik After Dark" };

export default function AdultWellnessPage() {
  return (
    <article style={prose}>
      <h1>Wellness resources</h1>
      <p>
        If pornography consumption is affecting your relationships, mental health, or daily
        life, free confidential help is available. The Service is for adults who choose to
        engage with it; we want that choice to remain healthy and informed.
      </p>

      <h2>If you are in the United States</h2>
      <ul>
        <li><a href="https://www.samhsa.gov/find-help/national-helpline" target="_blank" rel="noopener noreferrer">SAMHSA National Helpline</a> — 1-800-662-HELP (4357), 24/7, free, confidential.</li>
        <li><a href="https://988lifeline.org/" target="_blank" rel="noopener noreferrer">988 Suicide &amp; Crisis Lifeline</a> — call or text 988.</li>
      </ul>

      <h2>If you are in the European Union or United Kingdom</h2>
      <ul>
        <li><a href="https://www.findahelpline.com/" target="_blank" rel="noopener noreferrer">findahelpline.com</a> — verified helplines by country.</li>
        <li><a href="https://www.samaritans.org/" target="_blank" rel="noopener noreferrer">Samaritans (UK &amp; IE)</a> — 116 123, 24/7.</li>
      </ul>

      <h2>Healthy use</h2>
      <ul>
        <li>If your viewing interferes with sleep, work, or relationships, take a break.</li>
        <li>Talk to your GP or a licensed therapist; sex therapy is a recognised specialty.</li>
        <li>If you have concerns about a child or another adult&rsquo;s safety, contact local authorities immediately.</li>
      </ul>

      <p style={{ color: "#a1a1aa", fontSize: 13 }}>
        Swypik After Dark does not provide medical advice. This page lists publicly available
        resources for convenience and is not affiliated with the organisations listed.
      </p>
    </article>
  );
}

const prose: React.CSSProperties = { color: "#d4d4d8", lineHeight: 1.7, fontSize: 15, maxWidth: 760 };
