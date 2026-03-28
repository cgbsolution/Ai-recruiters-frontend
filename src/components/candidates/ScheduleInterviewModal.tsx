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
import { Input } from "@/components/ui/input";
import { Calendar, Clock, Mail, MessageSquare, Info, ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { TimePicker } from "@/components/ui/time-picker";
import EditEmailTemplateModal, { EmailTemplateData } from "./EditEmailTemplateModal";
import { notifySuccess, notifyError } from "@/lib/notify";
import { apiPost } from "@/lib/api";

interface ScheduleInterviewModalProps {
  open: boolean;
  onClose: () => void;
  candidateId: number;
  candidateName: string;
  jobTitle: string;
  contactInfo?: string;
  interviewUrl?: string;
  onScheduled: (candidate: any) => void;
}

const TIMEZONES = [
  { label: "India (IST)", value: "Asia/Calcutta", offset: "UTC+05:30" },
  { label: "UTC", value: "UTC", offset: "UTC+00:00" },
  { label: "US Eastern", value: "America/New_York", offset: "UTC-05:00" },
  { label: "US Pacific", value: "America/Los_Angeles", offset: "UTC-08:00" },
  { label: "UK (GMT/BST)", value: "Europe/London", offset: "UTC+01:00" },
  { label: "Singapore", value: "Asia/Singapore", offset: "UTC+08:00" },
  { label: "Dubai (GST)", value: "Asia/Dubai", offset: "UTC+04:00" },
  { label: "Australia (AEST)", value: "Australia/Sydney", offset: "UTC+11:00" },
];

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h < 12 ? "AM" : "PM"}`;
  const value = `${String(h).padStart(2, "0")}:${m}`;
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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ScheduleInterviewModal({
  open,
  onClose,
  candidateId,
  candidateName,
  jobTitle,
  contactInfo,
  interviewUrl,
  onScheduled,
}: ScheduleInterviewModalProps) {
  const today = new Date();
  const [tzValue, setTzValue] = useState("Asia/Calcutta");
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [joinBefore, setJoinBefore] = useState(false);
  const [flexibility, setFlexibility] = useState<"scheduled_time" | "anytime">("anytime");
  const [allowReschedule, setAllowReschedule] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState<"never" | "custom">("never");
  const [expiryValue, setExpiryValue] = useState(7);
  const [expiryUnit, setExpiryUnit] = useState<"hours" | "days">("days");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const days = buildCalendar(calYear, calMonth);
  const selectedTz = TIMEZONES.find((t) => t.value === tzValue) ?? TIMEZONES[0];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const isPast = (d: number) => {
    const date = new Date(calYear, calMonth, d);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return date < todayStart;
  };

  const isToday = (d: number) =>
    d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

  const isSelected = (d: number) =>
    d === selectedDay && calMonth === today.getMonth() && calYear === today.getFullYear()
    || d === selectedDay;

  const formattedDate = (() => {
    const dt = new Date(calYear, calMonth, selectedDay);
    const [h, m] = selectedTime.split(":").map(Number);
    dt.setHours(h, m);
    return dt.toLocaleString("en-US", {
      weekday: "short", year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) + ` (${selectedTz.label})`;
  })();

  const handleSchedule = async () => {
    setError("");
    setLoading(true);
    try {
      const [h, m] = selectedTime.split(":").map(Number);
      const isoDate = new Date(calYear, calMonth, selectedDay, h, m).toISOString();

      // Build candidate-specific interview link
      const candidateInterviewUrl = interviewUrl || "";

      const payload = {
        interview_date: isoDate,
        interview_timezone: tzValue,
        joining_flexibility: flexibility,
        allow_candidate_reschedule: allowReschedule,
        allow_joining_early: joinBefore,
        send_whatsapp: sendWhatsapp,
        interview_url: candidateInterviewUrl,
        link_expiry: linkExpiry === "custom" ? { value: expiryValue, unit: expiryUnit } : null,
        ...(emailTemplate && {
          email_subject: emailTemplate.subject,
          email_intro_text: emailTemplate.introText,
          email_extra_heading: emailTemplate.extraHeading,
          email_extra_body: emailTemplate.extraBody,
          cc_emails: emailTemplate.ccEmails ? emailTemplate.ccEmails.split(",").map((e) => e.trim()) : [],
        }),
      };

      const data = await apiPost<any>(`/candidates/${candidateId}/schedule-interview`, payload);
      onScheduled(data);

      // Build notification message based on actual send results
      const emailOk = data.email_sent === true;
      const whatsappOk = data.whatsapp_sent === true;

      if (emailOk && whatsappOk) {
        notifySuccess("Interview scheduled! Email and WhatsApp notifications sent.");
      } else if (emailOk) {
        notifySuccess("Interview scheduled! Email notification sent.");
      } else if (whatsappOk) {
        notifySuccess("Interview scheduled! WhatsApp sent, but email failed to send.");
      } else {
        notifySuccess("Interview scheduled! But email notification failed — check SMTP settings.");
      }
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
        <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto glass-scrollbar p-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Schedule Interview
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 mt-1">
              For <span className="font-medium text-gray-700">{candidateName}</span>
              {jobTitle && <> — <span className="text-gray-500">{jobTitle}</span></>}
            </p>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Timezone */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                Time Zone
              </Label>
              <Select value={tzValue} onValueChange={setTzValue}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      ({tz.offset}) {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date & Time Row */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-5">
              {/* Calendar */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Select Date
                </Label>
                <div className="border rounded-xl p-4 bg-white">
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={prevMonth}
                      className="h-8 w-8 rounded-lg"
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-500" />
                    </Button>
                    <span className="font-semibold text-sm text-gray-800">
                      {MONTH_NAMES[calMonth]} {calYear}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={nextMonth}
                      className="h-8 w-8 rounded-lg"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    </Button>
                  </div>

                  {/* Day names */}
                  <div className="grid grid-cols-7 text-center mb-2">
                    {DAY_NAMES.map((d) => (
                      <span key={d} className="text-xs font-medium text-gray-400 py-1">{d}</span>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7 text-center gap-y-1">
                    {days.map((d, i) => (
                      <Button
                        key={i}
                        variant="ghost"
                        size="sm"
                        disabled={!d || isPast(d)}
                        onClick={() => d && setSelectedDay(d)}
                        className={`w-9 h-9 p-0 mx-auto rounded-full text-sm font-medium transition-all
                          ${!d ? "invisible" : ""}
                          ${d && isPast(d) ? "text-gray-300 cursor-not-allowed" : ""}
                          ${d && isSelected(d)
                            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                            : d && isToday(d)
                            ? "ring-1 ring-blue-400 text-blue-600"
                            : d && !isPast(d)
                            ? "hover:bg-blue-50 text-gray-700"
                            : ""}
                        `}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Time */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-gray-400" />
                  Time
                </Label>
                <TimePicker value={selectedTime} onChange={setSelectedTime} />

                {/* Selected summary */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mt-3">
                  <p className="text-xs font-medium text-blue-600 mb-0.5">Scheduled For</p>
                  <p className="text-sm font-semibold text-blue-900">
                    {MONTH_NAMES[calMonth].slice(0, 3)} {selectedDay}, {calYear}
                  </p>
                  <p className="text-sm text-blue-700">
                    {(() => {
                      const [hStr, mStr] = selectedTime.split(":");
                      const h = parseInt(hStr, 10);
                      const m = mStr;
                      return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h < 12 ? "AM" : "PM"}`;
                    })()}
                  </p>
                  <p className="text-xs text-blue-500 mt-0.5">{selectedTz.label}</p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Settings Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Interview Settings</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left settings */}
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="joinBefore"
                      checked={joinBefore}
                      onCheckedChange={(v) => setJoinBefore(v as boolean)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="joinBefore" className="text-sm font-normal text-gray-600 leading-snug">
                      Allow joining 10 min early
                    </Label>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="reschedule"
                      checked={allowReschedule}
                      onCheckedChange={(v) => setAllowReschedule(v as boolean)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="reschedule" className="text-sm font-normal text-gray-600 leading-snug">
                      Allow candidate to reschedule
                    </Label>
                  </div>
                </div>

                {/* Right settings: Flexibility */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Joining Flexibility
                  </Label>
                  <RadioGroup
                    value={flexibility}
                    onValueChange={(v) => setFlexibility(v as any)}
                    className="space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="scheduled_time" id="f1" />
                      <Label htmlFor="f1" className="font-normal text-sm text-gray-600">
                        Must join at scheduled time
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="anytime" id="f2" />
                      <Label htmlFor="f2" className="font-normal text-sm text-gray-600">
                        Can join anytime
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Link Expiry */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" />
                  Interview Link Expiry
                </Label>
                <RadioGroup
                  value={linkExpiry}
                  onValueChange={(v) => setLinkExpiry(v as "never" | "custom")}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="never" id="exp1" />
                    <Label htmlFor="exp1" className="font-normal text-sm text-gray-600">
                      No expiry (link stays active)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="custom" id="exp2" />
                    <Label htmlFor="exp2" className="font-normal text-sm text-gray-600">
                      Expires after
                    </Label>
                  </div>
                </RadioGroup>
                {linkExpiry === "custom" && (
                  <div className="flex items-center gap-2 ml-6">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={expiryValue}
                      onChange={(e) => setExpiryValue(Number(e.target.value) || 1)}
                      className="w-20 h-8 text-sm"
                    />
                    <Select value={expiryUnit} onValueChange={(v) => setExpiryUnit(v as "hours" | "days")}>
                      <SelectTrigger className="w-24 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100" />

            {/* Notifications Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Notifications</h3>

              {/* Contact info */}
              {contactInfo && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                    <Info className="w-3 h-3" /> Contact Information
                  </p>
                  <p className="text-sm text-gray-600">{contactInfo}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    id="whatsapp"
                    checked={sendWhatsapp}
                    onCheckedChange={(v) => setSendWhatsapp(v as boolean)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="whatsapp" className="text-sm font-normal text-gray-600 leading-snug">
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-green-500" />
                      Send WhatsApp notification
                    </span>
                  </Label>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEmailModal(true)}
                  className="gap-1.5 text-xs"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Edit Email Body
                </Button>
              </div>

              {emailTemplate && (
                <p className="text-xs text-green-600 flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-lg">
                  Custom email template saved
                </p>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-6 mb-2">
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50/50">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={loading} className="min-w-[140px]">
              {loading ? "Scheduling..." : "Schedule Interview"}
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
        interviewUrl={interviewUrl || ""}
        joiningFlexibility={flexibility}
        onSave={(t) => setEmailTemplate(t)}
      />
    </>
  );
}
