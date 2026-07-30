import FlyClient from "./FlyClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Swypik Fly — bilete de avion",
    description: "Caută și rezervă zboruri la preț net + 10 lei. Prețuri în lei, fără comisioane ascunse.",
};

export default function FlyPage() {
    return <FlyClient />;
}
