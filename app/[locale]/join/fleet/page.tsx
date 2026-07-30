import { Suspense } from "react";
import FleetApplyClient from "./FleetApplyClient";

export const dynamic = "force-dynamic";

export default function FleetJoinPage() {
    return (
        <Suspense fallback={null}>
            <FleetApplyClient />
        </Suspense>
    );
}
