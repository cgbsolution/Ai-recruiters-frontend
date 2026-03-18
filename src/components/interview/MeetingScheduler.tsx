"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle, Clock } from "lucide-react";
import type { MeetingSlot } from "@/hooks/interview/useInterviewSession";

interface Props {
  onLoadSlots: () => Promise<MeetingSlot[]>;
  onSchedule: (slotId: number) => Promise<boolean>;
  onDone: () => void;
}

export default function MeetingScheduler({ onLoadSlots, onSchedule, onDone }: Props) {
  const [slots, setSlots] = useState<MeetingSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  useEffect(() => {
    onLoadSlots().then((data) => {
      setSlots(data);
      setLoading(false);
    });
  }, [onLoadSlots]);

  const handleSchedule = async () => {
    if (selectedSlot === null) return;
    setScheduling(true);
    const ok = await onSchedule(selectedSlot);
    if (ok) setScheduled(true);
    setScheduling(false);
  };

  const formatSlot = (slot: MeetingSlot) => {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = `${start.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} – ${end.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    return { dateStr, timeStr };
  };

  if (scheduled) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-900/40 flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Meeting Scheduled!</h2>
        <p className="text-gray-400 mb-8">You will receive a confirmation email shortly.</p>
        <Button onClick={onDone} className="h-12 px-8 bg-blue-600 hover:bg-blue-700">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-blue-900/40 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold text-white">Schedule a Meeting</h2>
          <p className="text-gray-400 mt-2">Select a time slot that works for you</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <div className="bg-gray-900 rounded-2xl p-8 text-center mb-6">
            <Clock className="w-8 h-8 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">No available slots at the moment.</p>
            <p className="text-gray-500 text-sm mt-1">The team will reach out to you directly.</p>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {slots.map((slot) => {
              const { dateStr, timeStr } = formatSlot(slot);
              const isSelected = selectedSlot === slot.id;
              return (
                <Button
                  key={slot.id}
                  variant="ghost"
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`w-full flex items-center justify-between px-5 py-4 h-auto rounded-xl border transition-all ${
                    isSelected
                      ? "bg-blue-900/30 border-blue-600 text-white"
                      : "bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600"
                  }`}
                >
                  <div className="text-left">
                    <p className="font-semibold text-sm">{dateStr}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timeStr}</p>
                  </div>
                  {isSelected && <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />}
                </Button>
              );
            })}
          </div>
        )}

        <div className="space-y-3">
          {slots.length > 0 && (
            <Button
              onClick={handleSchedule}
              disabled={selectedSlot === null || scheduling}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {scheduling ? "Scheduling..." : "Confirm Meeting"}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onDone}
            className="w-full text-gray-500 text-sm hover:text-gray-300 transition-colors py-2"
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
