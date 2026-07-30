import HostPanelClient from "./HostPanelClient";

export const dynamic = "force-dynamic";

export const metadata = {
    title: "Panoul gazdei — Swypik Stays",
    description: "Gestionează-ți cazările: poze, prețuri, publicare.",
};

export default function HostPanelPage() {
    return <HostPanelClient />;
}
