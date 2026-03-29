"use client";

import { Button } from "@/components/ui/button";
import { useGlobalModal } from "@/context/ModalContext";
import { useSidebar } from "@/components/ui/context/SidebarContext";
import { Plus } from "lucide-react";

export default function SidebarWidget({ collapsible = false }: { collapsible?: boolean }) {
  const { openModal } = useGlobalModal();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const expanded = !collapsible || isExpanded || isHovered || isMobileOpen;

  return (
    <Button
      size="sm"
      variant="primary"
      onClick={openModal}
      title="Create Opening"
      className={expanded ? "w-full mt-4" : "w-10 h-10 p-0 mt-4 mx-auto flex items-center justify-center"}
    >
      <Plus className="w-4 h-4 shrink-0" />
      {expanded && <span className="ml-1">Create Opening</span>}
    </Button>
  );
}