// components/GlobalCreateOpeningModal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useGlobalModal } from "@/context/ModalContext";

export function GlobalCreateOpeningModal() {
  const { isOpen, closeModal } = useGlobalModal();
  const router = useRouter();

  const handleSelect = (type: "technical" | "non-technical") => {
    closeModal();
    router.push(`/create-openings?openingType=${type}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeModal}>
      <DialogContent className="max-w-[480px] p-6">
        <DialogHeader className="items-center text-center">
          <Image
            src="/images/modal/job-create-modal.png"
            alt="Job Type Selection"
            width={250}
            height={100}
            className="mb-4"
          />
          <DialogTitle className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Select your job type
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400">
            Choose the type of job opening you want to create.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-4 mt-6">
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
      </DialogContent>
    </Dialog>
  );
}
