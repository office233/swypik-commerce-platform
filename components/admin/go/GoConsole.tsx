"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import LiveTab from "./LiveTab";
import PricingTab from "./PricingTab";
import DriversTab from "./DriversTab";

export default function GoConsole() {
  const t = useTranslations("adminGo");
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-fg">{t("title")}</h1>
      <Tabs defaultValue="live">
        <TabsList variant="underline">
          <TabsTrigger value="live">{t("tabs.live")}</TabsTrigger>
          <TabsTrigger value="pricing">{t("tabs.pricing")}</TabsTrigger>
          <TabsTrigger value="drivers">{t("tabs.drivers")}</TabsTrigger>
        </TabsList>
        <TabsContent value="live" className="pt-4">
          <LiveTab />
        </TabsContent>
        <TabsContent value="pricing" className="pt-4">
          <PricingTab />
        </TabsContent>
        <TabsContent value="drivers" className="pt-4">
          <DriversTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
