"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Globe, MessageCircle } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

const PREVIEW_TEXTS: Record<string, string> = {
  en: "\"Tell me about a challenging project you've worked on and how you handled it.\"",
  hi: "\"मुझे किसी चुनौतीपूर्ण प्रोजेक्ट के बारे में बताएं जिस पर आपने काम किया और आपने उसे कैसे संभाला।\"",
};

interface Props {
  onConfirm: (language: string) => void;
}

export default function LanguageStep({ onConfirm }: Props) {
  const [selected, setSelected] = useState("en");

  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-violet-50 border border-violet-100 flex items-center justify-center mx-auto mb-5">
            <Globe className="w-7 h-7 text-violet-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose your language</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            The interview will be conducted in your chosen language.<br />
            Your answer quality matters — not which language you use.
          </p>
        </div>

        {/* Language grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelected(lang.code)}
              className={`px-5 py-3 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                selected === lang.code
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm shadow-violet-200"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              {lang.label}
              {lang.native && (
                <span className="ml-1.5 text-gray-400 font-normal">· {lang.native}</span>
              )}
            </button>
          ))}
        </div>

        {/* Info note */}
        <div className="bg-violet-50 border border-violet-100 rounded-xl px-5 py-4 mb-8">
          <p className="text-sm text-violet-700 leading-relaxed">
            You can switch language at any point during the interview. The AI interviewer speaks your language fluently.
          </p>
        </div>

        {/* Preview */}
        <div className="mb-10">
          <p className="text-sm text-gray-500 mb-3">What the interviewer sounds like:</p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
            <div className="flex gap-3">
              <MessageCircle className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 italic leading-relaxed">
                {PREVIEW_TEXTS[selected]}
              </p>
            </div>
          </div>
        </div>

        {/* Confirm button */}
        <Button
          onClick={() => onConfirm(selected)}
          className="w-full h-13 text-base bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-md shadow-violet-200"
        >
          Confirm language
        </Button>
      </div>
    </div>
  );
}
