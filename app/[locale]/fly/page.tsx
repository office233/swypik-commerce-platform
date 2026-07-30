import FlyClient from "./FlyClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Swypik Fly — bilete de avion",
    description: "Caută și rezervă zboruri cu preț final afișat din start. În lei, fără taxe ascunse la plată.",
};

export default function FlyPage() {
    return <FlyClient />;
}
