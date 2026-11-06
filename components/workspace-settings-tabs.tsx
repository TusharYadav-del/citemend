"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function WorkspaceSettingsTabs({ settings, partner }: { settings: ReactNode; partner: ReactNode }) {
  return <Tabs defaultValue="settings" className="mb-6 w-full">
    <TabsList aria-label="Workspace settings sections" className="mb-4 border border-white/10 bg-white/[.03]">
      <TabsTrigger value="settings">Settings</TabsTrigger>
      <TabsTrigger value="partner">Partner</TabsTrigger>
    </TabsList>
    <TabsContent value="settings" className="space-y-4">{settings}</TabsContent>
    <TabsContent value="partner" className="space-y-4">{partner}</TabsContent>
  </Tabs>;
}
