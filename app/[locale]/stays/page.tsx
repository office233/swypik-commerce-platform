import StaysClient from "./StaysClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Swypik Stays — cazări și hoteluri",
    description: "Caută și rezervă cazări cu preț final afișat din start. În lei, fără taxe ascunse la plată.",
};

export default function StaysPage() {
    return <StaysClient />;
}
