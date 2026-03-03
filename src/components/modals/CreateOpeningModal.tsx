"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/components/ui/hooks/useModal";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function CreateOpeningModal() {
  const { isOpen, openModal, closeModal } = useModal();
  const router = useRouter();

  const handleSelect = (type: "technical" | "non-technical") => {
    closeModal();
    router.push(`/create-openings?openingType=${type}`);
  };

  return (
    <>
      <Button size="sm" variant="primary" onClick={openModal}>
        <PlusIcon />
        Create Opening
      </Button>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[480px] p-6">
        <div className="flex flex-col items-center text-center">
          <Image
            className="dark:hidden"
            src="/images/modal/job-create-modal.png"
            alt="Logo"
            layout="responsive"
            width={250}
            height={100}
          />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-4">
            Select your job type
          </h2>
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => handleSelect("technical")}>
              Technical
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSelect("non-technical")}
            >
              Non-Technical
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
