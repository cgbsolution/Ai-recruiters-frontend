"use client";

import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { useGlobalModal } from "@/context/ModalContext";

export default function SidebarWidget() {
  const { openModal } = useGlobalModal();

  return (
    <Button size="sm" variant="primary" onClick={openModal}>
      <PlusIcon />
      Create Opening
    </Button>
  );
}