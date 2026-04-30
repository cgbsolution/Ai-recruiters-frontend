// components/GlobalCreateOpeningModal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowRight, Briefcase, Code2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalModal } from "@/context/ModalContext";
import { cn } from "@/lib/utils";

type OpeningType = "technical" | "non-technical";

type OptionCard = {
  type: OpeningType;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconWrapper: string;
  hoverBorder: string;
  hoverRing: string;
};

const OPTIONS: OptionCard[] = [
  {
    type: "technical",
    title: "Technical",
    description:
      "Engineering, data, design, product — roles with coding or technical assessments.",
    icon: <Code2 className="h-5 w-5" />,
    iconWrapper:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-500/60",
    hoverRing: "group-hover:ring-indigo-200/70 dark:group-hover:ring-indigo-500/20",
  },
  {
    type: "non-technical",
    title: "Non-Technical",
    description:
      "Sales, marketing, HR, operations, finance — roles assessed on soft skills.",
    icon: <Briefcase className="h-5 w-5" />,
    iconWrapper:
      "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300",
    hoverBorder: "hover:border-purple-300 dark:hover:border-purple-500/60",
    hoverRing: "group-hover:ring-purple-200/70 dark:group-hover:ring-purple-500/20",
  },
];

export function GlobalCreateOpeningModal() {
  const { isOpen, closeModal } = useGlobalModal();
  const router = useRouter();

  const handleSelect = (type: OpeningType) => {
    closeModal();
    router.push(`/create-openings?openingType=${type}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={closeModal}>
      <DialogContent className="max-w-[560px] overflow-hidden p-0">
        <div className="relative bg-gradient-to-b from-indigo-50/70 via-purple-50/40 to-transparent px-6 pt-8 pb-6 dark:from-indigo-500/10 dark:via-purple-500/5 dark:to-transparent">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
            <Sparkles className="h-5 w-5 text-indigo-500 dark:text-indigo-300" />
          </div>
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
              Create a new opening
            </DialogTitle>
            <DialogDescription className="mx-auto max-w-sm text-sm text-gray-500 dark:text-gray-400">
              Choose the type of role you&apos;re hiring for — we&apos;ll tailor
              the form and interview plan accordingly.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => handleSelect(opt.type)}
              className={cn(
                "group relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all duration-200",
                "ring-0 ring-offset-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                "hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-gray-900/40",
                opt.hoverBorder
              )}
            >
              <span
                className={cn(
                  "mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ring-4 ring-transparent transition-all",
                  opt.iconWrapper,
                  opt.hoverRing
                )}
              >
                {opt.icon}
              </span>

              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {opt.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {opt.description}
              </p>

              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">
                Continue
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
