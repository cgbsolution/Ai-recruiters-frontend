"use client";
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import EditEmailTemplateModal, { EmailTemplateData } from "./EditEmailTemplateModal";
import { notifySuccess, notifyError } from "@/lib/notify";

interface ScheduleInterviewModalProps {
  open: boolean;
  onClose: () => void;
  candidateId: number;
  candidateName: string;
  jobTitle: string;
  contactInfo?: string;
  onScheduled: (candidate: any) => void;
}

const TIMEZONES = [
  "(UTC+05:30) Asia/Calcutta",
  "(UTC+00:00) UTC",
  "(UTC-05:00) America/New_York",
  "(UTC-08:00) America/Los_Angeles",
  "(UTC+01:00) Europe/London",
  "(UTC+08:00) Asia/Singapore",
];

const TIMES = Array.from({ length: 24 }, (_, h) => {
  const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:00 ${h < 12 ? "AM" : "PM"}`;
  const value = `${String(h).padStart(2, "0")}:00`;
  return { label, value };
});

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function buildCalendar(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = getDaysInMonth(year, month);
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= totalDays; d++) days.push(d);
  return days;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ScheduleInterviewModal({
  open,
  onClose,
  candidateId,
  candidateName,
  jobTitle,
  contactInfo,
  onScheduled,
}: ScheduleInterviewModalProps) {
  const today = new Date();
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedTime, setSelectedTime] = useState("01:00");
  const [joinBefore, setJoinBefore] = useState(false);
  const [flexibility, setFlexibility] = useState<"scheduled_time" | "anytime">("anytime");
  const [allowReschedule, setAllowReschedule] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const days = buildCalendar(calYear, calMonth);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const isToday = (d: number) =>
    d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

  const tzCode = timezone.split(") ")[1] || "Asia/Calcutta";

  const formattedDate = (() => {
    const dt = new Date(calYear, calMonth, selectedDay);
    const [h, m] = selectedTime.split(":").map(Number);
    dt.setHours(h, m);
    return dt.toLocaleString("en-US", {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) + ` (${tzCode})`;
  })();

  const handleSchedule = async () => {
    setError("");
    setLoading(true);
    try {
      const isoDate = new Date(calYear, calMonth, selectedDay, ...selectedTime.split(":").map(Number)).toISOString();

      const payload = {
        interview_date: isoDate,
        interview_timezone: tzCode,
        joining_flexibility: flexibility,
        allow_candidate_reschedule: allowReschedule,
        send_whatsapp: sendWhatsapp,
        ...(emailTemplate && {
          email_subject: emailTemplate.subject,
          email_intro_text: emailTemplate.introText,
          email_extra_heading: emailTemplate.extraHeading,
          email_extra_body: emailTemplate.extraBody,
          cc_emails: emailTemplate.ccEmails ? emailTemplate.ccEmails.split(",").map((e) => e.trim()) : [],
        }),
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/candidates/${candidateId}/schedule-interview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Scheduling failed");
      }
      const data = await res.json();
      onScheduled(data);
      const notifMsg = sendWhatsapp
        ? "Interview scheduled! Email and WhatsApp notifications sent to candidate."
        : "Interview scheduled! Email notification sent to candidate.";
      notifySuccess(notifMsg);
      onClose();
    } catch (err: any) {
      notifyError(err.message || "Failed to schedule interview");
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Schedule Interview For {candidateName}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6">
            {/* Left: Calendar */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Choose interview time zone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Select date</Label>
                <div className="border rounded-lg p-3 mt-1">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-2">
                    <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">‹</button>
                    <span className="font-medium text-sm">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </span>
                    <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">›</button>
                  </div>
                  <div className="grid grid-cols-7 text-center text-xs text-gray-500 mb-1">
                    {["S","M","T","W","T","F","S"].map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 text-center text-sm gap-y-1">
                    {days.map((d, i) => (
                      <button
                        key={i}
                        disabled={!d}
                        onClick={() => d && setSelectedDay(d)}
                        className={`w-8 h-8 mx-auto rounded-full transition-colors text-sm
                          ${!d ? "invisible" : ""}
                          ${d === selectedDay && calMonth === today.getMonth() && calYear === today.getFullYear()
                            ? "bg-blue-600 text-white"
                            : isToday(d as number) && d !== selectedDay
                            ? "border border-blue-400 text-blue-600"
                            : "hover:bg-gray-100"}
                        `}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Select time</Label>
                <Select value={selectedTime} onValueChange={setSelectedTime}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Right: Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="joinBefore"
                  checked={joinBefore}
                  onCheckedChange={(v) => setJoinBefore(v as boolean)}
                />
                <Label htmlFor="joinBefore" className="text-sm">
                  Enable joining 10 minutes before the scheduled time
                </Label>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Joining Flexibility</Label>
                <RadioGroup
                  value={flexibility}
                  onValueChange={(v) => setFlexibility(v as any)}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="scheduled_time" id="f1" />
                    <Label htmlFor="f1" className="font-normal text-sm">
                      Candidate must join at the scheduled time
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="anytime" id="f2" />
                    <Label htmlFor="f2" className="font-normal text-sm">
                      Candidate can join anytime
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="reschedule"
                  checked={allowReschedule}
                  onCheckedChange={(v) => setAllowReschedule(v as boolean)}
                />
                <Label htmlFor="reschedule" className="text-sm">Allow candidate to reschedule</Label>
              </div>

              {contactInfo && (
                <div className="space-y-1">
                  <Label className="font-semibold text-sm flex items-center gap-1">
                    Contact information
                    <span className="text-gray-400 text-xs">(ℹ)</span>
                  </Label>
                  <div className="text-sm text-gray-600 border rounded p-3 bg-gray-50">
                    {contactInfo}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="whatsapp"
                  checked={sendWhatsapp}
                  onCheckedChange={(v) => setSendWhatsapp(v as boolean)}
                />
                <Label htmlFor="whatsapp" className="text-sm">Send WhatsApp notification</Label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEmailModal(true)}>
                  ✉ Edit Email Body
                </Button>
              </div>

              {emailTemplate && (
                <p className="text-xs text-green-600">✓ Custom email template saved</p>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={loading}>
              {loading ? "Scheduling..." : "Review & Schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditEmailTemplateModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        candidateName={candidateName}
        jobTitle={jobTitle}
        interviewDate={formattedDate}
        interviewUrl=""
        onSave={(t) => setEmailTemplate(t)}
      />
    </>
  );
}
