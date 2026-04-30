"use client";
import React, { useMemo, useState, useEffect } from "react";
import AIJDModal, { type AIGeneratedJD } from "@/components/modals/AIJDModal";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Slider,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { notifyError, notifySuccess, notifyInfo } from "@/lib/notify";
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  Info,
  Sparkles,
  FileText,
  ListChecks,
  SlidersHorizontal,
  Building2,
  MapPin,
  Briefcase,
  TrendingUp,
  Users,
  BadgeCheck,
  Upload,
  Wand2,
  GripVertical,
  Code2,
  Smartphone,
  UserCircle2,
  ScanFace,
  UserCog,
  Video,
  Camera,
  UsersRound,
  Target,
  ClipboardCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  Lock,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// --- Config
import { api, apiPost, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type SkillGroup = {
  id: string;
  name: string;
  skills: string[];
  skill_criteria: "All Mandatory" | "At Least One" | "None";
};

interface CreateOpeningFormProps {
  jobId?: string;
}

const STEPS = [
  { label: "Basic Info", icon: FileText },
  { label: "Responsibilities", icon: ListChecks },
  { label: "Interview Setup", icon: SlidersHorizontal },
] as const;

export default function CreateOpeningForm({ jobId }: CreateOpeningFormProps) {
  const searchParams = useSearchParams();
  const openingType = searchParams?.get("openingType") || "technical";
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const canUseCodeEditor = hasRole("super_admin") || (user?.allow_code_editor ?? false);
  const isEditMode = Boolean(jobId);

  // AI JD modal
  const [aiJDModalOpen, setAiJDModalOpen] = useState(false);

  // Step (0..2)
  const [step, setStep] = useState<number>(0);
  const [loading, setLoading] = useState(isEditMode);

  // ---------- STEP 1 (Basic Info) ----------
  const [title, setTitle] = useState<string>("");
  const [department, setDepartment] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [jobType, setJobType] = useState<string>("Full-time");
  const [experienceRange, setExperienceRange] = useState<number[]>([0, 2]);
  const [openings, setOpenings] = useState<number>(1);
  const [empType, setEmpType] = useState<string>("Permanent");
  const [uploadJD, setUploadJD] = useState<File | null>(null);
  const [open, setOpen] = useState(false);

  // ---------- STEP 2 (Responsibilities) ----------
  const [responsibilities, setResponsibilities] = useState<string[]>([]);

  // ---------- STEP 3 (Interview Setup + bottom: Skills & Criteria) ----------
  const [interviewSettings, setInterviewSettings] = useState({
    codeEditor: false,
    allowFromMobile: false,
    enableVirtualAvatar: true,
    resumeBased: true,
    manualInterview: false,
    faceMatchRequired: false,
    webCamRequired: true,
    secondaryCamVerification: false,
    allowCandidateContact: false,
  });

  const [manager, setManager] = useState({
    name: user?.name || "",
    phone: "",
    email: user?.email || "",
  });
  const [questionType, setQuestionType] = useState<"traditional" | "scenario">(
    "traditional"
  );
  const [maxQuestions, setMaxQuestions] = useState<number>(10);
  const [autoSkipSeconds, setAutoSkipSeconds] = useState<number>(0);
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [scoringLeniency, setScoringLeniency] = useState<string>(
    "Standard Evaluation"
  );
  const [scoringCustomInstructions, setScoringCustomInstructions] =
    useState<boolean>(false);
  const [scoringCustomText, setScoringCustomText] = useState<string>("");
  const [customQuestionsMode, setCustomQuestionsMode] = useState<
    "mix" | "only" | "ai_only"
  >("mix");
  const [customQuestions, setCustomQuestions] = useState<{text: string; category: string; difficulty: string}[]>([]);

  const [skillGroups, setSkillGroups] = useState<SkillGroup[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // ---------- Question Bank State ----------
  const [showQuestionBank, setShowQuestionBank] = useState<boolean>(false);
  const [availableQuestions, setAvailableQuestions] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("");
  const [questionsCount, setQuestionsCount] = useState<number>(5);
  const [filteredQuestions, setFilteredQuestions] = useState<any[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(
    new Set()
  );

  // Extract unique categories and difficulties from available questions
  const extractedQuestionCategories = useMemo(() => {
    const categories = new Set(
      availableQuestions
        .map((q: any) => q.category)
        .filter((category: string) => category && category.trim() !== "")
    );
    return Array.from(categories);
  }, [availableQuestions]);

  const extractedDifficultyOptions = useMemo(() => {
    const difficulties = new Set(
      availableQuestions
        .map((q: any) => q.difficulty)
        .filter((difficulty: string) => difficulty && difficulty.trim() !== "")
    );
    return Array.from(difficulties);
  }, [availableQuestions]);

  // ---------- AI JD Prefill callback ----------
  const CRITERIA_MAP: Record<number, SkillGroup["skill_criteria"]> = {
    1: "All Mandatory",
    2: "At Least One",
    3: "None",
  };

  const handleJDGenerated = async (jd: AIGeneratedJD) => {
    if (jd.title) setTitle(jd.title);

    if (jd.experience_min !== undefined && jd.experience_max !== undefined) {
      setExperienceRange([jd.experience_min, jd.experience_max]);
    }

    if (Array.isArray(jd.responsibilities) && jd.responsibilities.length > 0) {
      setResponsibilities(jd.responsibilities);
    }

    if (Array.isArray(jd.skill_groups) && jd.skill_groups.length > 0) {
      const mapped: SkillGroup[] = jd.skill_groups.map((grp, i) => ({
        id: `group_ai_${Date.now()}_${i}`,
        name: grp.name,
        skills: grp.skills,
        skill_criteria: CRITERIA_MAP[grp.criteria] ?? "All Mandatory",
      }));
      setSkillGroups(mapped);
      setExpandedGroups(new Set(mapped.map((g) => g.id)));
    }

    const qCount = jd.coding_questions_count ?? 5;
    setMaxQuestions(qCount);

    try {
      const allSkills = (jd.skill_groups ?? []).flatMap((g) => g.skills).slice(0, 10);
      const data = await apiPost<any>("/ai/generate-questions", {
        job_title: jd.title,
        department: "",
        skills: allSkills,
        difficulty: "intermediate",
        count: qCount,
        mode: "TRADITIONAL",
      });
      const generated = (data.questions as { text: string; category: string; difficulty: string }[]) ?? [];
      if (generated.length > 0) {
        setCustomQuestions(
          generated.map((q) => ({
            text: q.text ?? "",
            category: q.category ?? "general",
            difficulty: q.difficulty ?? "intermediate",
          }))
        );
      }
    } catch {
      // Questions generation is best-effort; don't block the form
    }
  };

  // ---------- Helpers ----------
  const addResponsibility = () => setResponsibilities((p) => [...p, ""]);
  const changeResponsibility = (i: number, v: string) =>
    setResponsibilities((p) => p.map((r, idx) => (idx === i ? v : r)));
  const deleteResponsibility = (i: number) =>
    setResponsibilities((p) => p.filter((_, idx) => idx !== i));

  // Skill Group Helpers
  const addSkillGroup = () => {
    const newGroup: SkillGroup = {
      id: `group_${Date.now()}`,
      name: `Skill Group ${skillGroups.length + 1}`,
      skills: [""],
      skill_criteria: "All Mandatory",
    };
    setSkillGroups((prev) => [...prev, newGroup]);
    setExpandedGroups((prev) => new Set([...prev, newGroup.id]));
  };

  const updateSkillGroupName = (groupId: string, name: string) => {
    setSkillGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, name } : group))
    );
  };

  const deleteSkillGroup = (groupId: string) => {
    setSkillGroups((prev) => prev.filter((group) => group.id !== groupId));
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      newSet.delete(groupId);
      return newSet;
    });
  };

  const addSkillToGroup = (groupId: string) => {
    setSkillGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, skills: [...group.skills, ""] }
          : group
      )
    );
  };

  const updateSkillInGroup = (
    groupId: string,
    skillIndex: number,
    value: string
  ) => {
    setSkillGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              skills: group.skills.map((skill, idx) =>
                idx === skillIndex ? value : skill
              ),
            }
          : group
      )
    );
  };

  const deleteSkillFromGroup = (groupId: string, skillIndex: number) => {
    setSkillGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              skills: group.skills.filter((_, idx) => idx !== skillIndex),
            }
          : group
      )
    );
  };

  const updateSkillGroupCriteria = (
    groupId: string,
    criteria: "All Mandatory" | "At Least One" | "None"
  ) => {
    setSkillGroups((prev) =>
      prev.map((group) =>
        group.id === groupId ? { ...group, skill_criteria: criteria } : group
      )
    );
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const toggleInterviewSetting = (key: keyof typeof interviewSettings) =>
    setInterviewSettings((s) => {
      const newVal = !s[key];
      const updates: Partial<typeof s> = { [key]: newVal };
      // Mutual exclusivity: Avatar and Manual Interview cannot both be on
      if (key === "enableVirtualAvatar" && newVal) updates.manualInterview = false;
      if (key === "manualInterview" && newVal) updates.enableVirtualAvatar = false;
      return { ...s, ...updates };
    });

  const addCustomQuestion = (q = "") =>
    setCustomQuestions((p) => [...p, {
      text: q || `Question ${p.length + 1}`,
      category: "general",
      difficulty: "medium"
    }]);

  const updateCustomQuestion = (i: number, v: string) =>
    setCustomQuestions((p) => p.map((q, idx) => (idx === i ? { ...q, text: v } : q)));

  const deleteCustomQuestion = (i: number) =>
    setCustomQuestions((p) => p.filter((_, idx) => idx !== i));

  // ---------- Question Bank Functions ----------
  const fetchAllQuestions = async () => {
    try {
      const data = await api<any[]>("/questions/");
      setAvailableQuestions(data);
      setFilteredQuestions(data);
    } catch (error) {
      console.error("Error fetching questions:", error);
      notifyError("Failed to load questions from bank");
    }
  };

  useEffect(() => {
    if (selectedCategory !== "all" || selectedDifficulty !== "all") {
      const filtered = availableQuestions.filter((q: any) => {
        const categoryMatch =
          selectedCategory === "all" || q.category === selectedCategory;
        const difficultyMatch =
          selectedDifficulty === "all" || q.difficulty === selectedDifficulty;
        return categoryMatch && difficultyMatch;
      });
      setFilteredQuestions(filtered);
    } else {
      setFilteredQuestions(availableQuestions);
    }
  }, [selectedCategory, selectedDifficulty, availableQuestions]);

  const toggleQuestionSelection = (questionId: number) => {
    setSelectedQuestionIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  const addRandomQuestions = () => {
    const available = filteredQuestions.filter(
      (q) => !selectedQuestionIds.has(q.id)
    );
    const randomQuestions = available
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(questionsCount, available.length));

    const newQuestions = randomQuestions.map((q) => ({
      text: q.text,
      category: q.category || "general",
      difficulty: q.difficulty || "medium"
    }));
    setCustomQuestions((prev) => [...prev, ...newQuestions]);

    setShowQuestionBank(false);
    notifySuccess(`Added ${randomQuestions.length} questions from bank`);
  };

  const addSelectedQuestions = () => {
    const selectedQuestions = availableQuestions.filter((q) =>
      selectedQuestionIds.has(q.id)
    );
    const questionData = selectedQuestions.map((q) => ({
      text: q.text,
      category: q.category || "general",
      difficulty: q.difficulty || "medium"
    }));

    setCustomQuestions((prev) => [...prev, ...questionData]);
    setShowQuestionBank(false);
    setSelectedQuestionIds(new Set());
    notifySuccess(`Added ${selectedQuestions.length} selected questions`);
  };

  const openQuestionBank = () => {
    setShowQuestionBank(true);
    setSelectedQuestionIds(new Set());
    setSelectedCategory("all");
    setSelectedDifficulty("all");
    setQuestionsCount(5);
    fetchAllQuestions();
  };

  // ---------- Enhanced Validation / step completion (3 steps) ----------
  const stepCompleted = useMemo(() => {
    const s0 =
      title.trim().length > 0 &&
      location.trim().length > 0 &&
      openings > 0 &&
      empType.trim().length > 0;

    const s1 = responsibilities.filter((r) => r.trim().length > 0).length > 0;

    const s2 =
      (Object.values(interviewSettings).some(Boolean) ||
      manager.name.trim().length > 0 ||
      manager.email.trim().length > 0 ||
      manager.phone.trim().length > 0 ||
      skillGroups.some((group) =>
        group.skills.some((skill) => skill.trim().length > 0)
      ) ||
      specialInstructions.trim().length > 0) &&
      manager.name.trim().length > 0;

    return [s0, s1, s2];
  }, [
    title,
    location,
    openings,
    empType,
    responsibilities,
    interviewSettings,
    manager,
    skillGroups,
    specialInstructions,
  ]);

  const checkStepRequirements = (targetStep: number): boolean => {
    switch (targetStep) {
      case 0:
        if (!title.trim()) {
          notifyError("Job Title is required");
          return false;
        }
        if (!location.trim()) {
          notifyError("Location is required");
          return false;
        }
        return true;

      case 1:
        if (responsibilities.filter((r) => r.trim().length > 0).length === 0) {
          notifyError("At least one Job Responsibility is required");
          return false;
        }
        return true;

      case 2:
        if (!manager.name.trim()) {
          notifyError("Assigned Manager Name is required");
          return false;
        }
        if (skillGroups.length === 0 || !skillGroups.some(group =>
          group.skills.some(skill => skill.trim().length > 0)
        )) {
          notifyError("At least one Skill to Test is required");
          return false;
        }
        return true;

      default:
        return true;
    }
  };

  const tryGoToStep = (target: number) => {
    if (target <= step) {
      setStep(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    for (let s = 0; s < target; s++) {
      if (!stepCompleted[s]) {
        checkStepRequirements(s);
        return;
      }
    }
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    if (!checkStepRequirements(step)) {
      return;
    }

    if (!stepCompleted[step]) {
      notifyError("Please fill required fields in this step before proceeding.");
      return;
    }
    setStep((s) => Math.min(2, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatMmSs = (seconds: number) => {
    const mm = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const ss = Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const [uploadingJD, setUploadingJD] = useState(false);

  const handleUpload = async () => {
    if (!uploadJD) return;

    setUploadingJD(true);

    try {
      const formData = new FormData();
      formData.append("file", uploadJD);

      const parsed = await apiUpload<AIGeneratedJD>("/ai/parse-jd-file", formData);
      setOpen(false);
      notifySuccess(`JD file "${uploadJD.name}" parsed and populated successfully`);
      handleJDGenerated(parsed);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : (err instanceof Error ? err.message : String(err));
      notifyError(`Failed to parse JD file: ${msg}`);
    } finally {
      setUploadingJD(false);
    }
  };

  const progressPercent = Math.round(((step + 1) / 3) * 100);
  const responsibilityCount = responsibilities.filter((r) => r.trim().length > 0).length;
  const hasAtLeastOneSkill = skillGroups.some((g) => g.skills.some((s) => s.trim().length > 0));

  // Fetch job data for edit mode
  useEffect(() => {
    if (isEditMode && jobId) {
      const fetchJobData = async () => {
        try {
          setLoading(true);
          const jobData = await api<any>(`/jobs/${jobId}`);

          setTitle(jobData.title || "");
          setDepartment(jobData.department || "");
          setLocation(jobData.location || "");
          setJobType(jobData.job_type || "Full-time");
          setOpenings(jobData.openings || 1);
          setEmpType(jobData.emp_type || "Permanent");

          if (
            jobData.experience_min !== undefined &&
            jobData.experience_max !== undefined
          ) {
            setExperienceRange([
              jobData.experience_min,
              jobData.experience_max,
            ]);
          }

          if (jobData.responsibilities) {
            setResponsibilities(
              jobData.responsibilities.map((r: any) => r.description || "")
            );
          }

          if (jobData.interview_settings) {
            const settings = jobData.interview_settings;
            setInterviewSettings({
              codeEditor: settings.code_editor_required || false,
              allowFromMobile: settings.allow_mobile || false,
              enableVirtualAvatar: settings.virtual_avatar || false,
              resumeBased: settings.resume_based || false,
              manualInterview: settings.manual_interview || false,
              faceMatchRequired: settings.face_match || false,
              webCamRequired: settings.webcam_required || false,
              secondaryCamVerification: settings.secondary_cam || false,
              allowCandidateContact: jobData.allow_to_contact || false,
            });
          }

          setManager({
            name: jobData.manager_name || "",
            phone: jobData.manager_phone || "",
            email: jobData.manager_email || "",
          });

          setQuestionType(
            jobData.interview_settings?.mode === "SCENARIO"
              ? "scenario"
              : "traditional"
          );
          setMaxQuestions(jobData.interview_settings?.max_questions || 10);
          setAutoSkipSeconds(
            jobData.interview_settings?.auto_skip_timeout || 0
          );
          setSpecialInstructions(
            jobData.interview_settings?.special_instructions || ""
          );
          setScoringLeniency(
            jobData.evaluation_scoring || "Standard Evaluation"
          );

          if (jobData.questions) {
            setCustomQuestions(jobData.questions.map((q: any) => ({
              text: q.text || "",
              category: q.category || "general",
              difficulty: q.difficulty || "medium"
            })));
          }
          const mqVal = (jobData.mix_of_questions || "").toLowerCase();
          setCustomQuestionsMode(
            mqVal === "only" ? "only" : mqVal === "ai_only" ? "ai_only" : "mix"
          );

          if (jobData.skills && jobData.skills.length > 0) {
            const groupedSkills: { [key: string]: SkillGroup } = {};

            jobData.skills.forEach((skill: any) => {
              const groupName = skill.name || "Default Group";
              if (!groupedSkills[groupName]) {
                groupedSkills[groupName] = {
                  id: `group_${Date.now()}_${groupName}`,
                  name: groupName,
                  skills: [],
                  skill_criteria: skill.skill_criteria || "All Mandatory",
                };
              }
              if (skill.skill) {
                groupedSkills[groupName].skills.push(skill.skill);
              }
            });

            const skillGroupsArray = Object.values(groupedSkills);
            setSkillGroups(skillGroupsArray);
            setExpandedGroups(
              new Set(skillGroupsArray.map((group) => group.id))
            );
          }

        } catch (error) {
          console.error("Error fetching job data:", error);
          notifyError("Failed to load job data");
        } finally {
          setLoading(false);
        }
      };

      fetchJobData();
    }
  }, [isEditMode, jobId]);

  // ---------- Submit ----------
  const handleSubmit = async () => {
    if (!title.trim()) {
      notifyError("Please enter a job title.");
      setStep(0);
      return;
    }
    if (!location.trim()) {
      notifyError("Please enter a location.");
      setStep(0);
      return;
    }
    if (responsibilities.filter((r) => r.trim().length > 0).length === 0) {
      notifyError("Please add at least one job responsibility.");
      setStep(1);
      return;
    }
    if (!manager.name.trim()) {
      notifyError("Please enter an assigned manager name.");
      setStep(2);
      return;
    }
    if (skillGroups.length === 0 || !skillGroups.some(group =>
      group.skills.some(skill => skill.trim().length > 0)
    )) {
      notifyError("Please add at least one skill to test.");
      setStep(2);
      return;
    }

    const interview_payload = {
      code_editor_required: interviewSettings.codeEditor,
      resume_based: interviewSettings.resumeBased,
      virtual_avatar: interviewSettings.enableVirtualAvatar,
      allow_mobile: interviewSettings.allowFromMobile,
      face_match: interviewSettings.faceMatchRequired,
      webcam_required: interviewSettings.webCamRequired,
      secondary_cam: interviewSettings.secondaryCamVerification,
      mode: questionType === "traditional" ? "TRADITIONAL" : "SCENARIO",
      max_questions: maxQuestions,
      auto_skip_timeout: autoSkipSeconds,
      special_instructions: specialInstructions || "",
      scoring: scoringCustomInstructions
        ? scoringCustomText || scoringLeniency
        : scoringLeniency || "Default",
      manual_interview: interviewSettings.manualInterview,
    };

    const mappedSkills = skillGroups.flatMap((group) =>
      group.skills
        .filter((skill) => skill.trim().length > 0)
        .map((skill) => ({
          name: group.name,
          skill: skill.trim(),
          skill_criteria: group.skill_criteria,
        }))
    );

    const payload = {
      title: title,
      department: department,
      location: location,
      job_type: jobType,
      experience_level: `${experienceRange[0]}-${experienceRange[1]} Years`,
      experience_min: experienceRange[0],
      experience_max: experienceRange[1],
      openings: openings,
      emp_type: empType,
      status: "Open",
      responsibilities: responsibilities
        .filter((r) => r.trim().length > 0)
        .map((r) => ({ description: r.trim() })),
      skills: mappedSkills,
      interview_settings: interview_payload,
      manager_name: manager.name,
      manager_phone: manager.phone,
      manager_email: manager.email,
      evaluation_scoring: scoringLeniency,
      mix_of_questions: customQuestionsMode === "mix" ? "mix" : customQuestionsMode === "ai_only" ? "ai_only" : "only",
      questions: customQuestions,
      allow_to_contact: interviewSettings.allowCandidateContact,
      upload_jd: uploadJD ? uploadJD.name : "",
    };

    try {
      const path = isEditMode ? `/jobs/${jobId}` : "/jobs/";
      const method = isEditMode ? "PUT" : "POST";

      await api(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Broadcast so dashboards & lists refresh in real-time
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(isEditMode ? "job:updated" : "job:created"));
      }

      notifySuccess(`Job ${isEditMode ? "Updated" : "Created"} Successfully!`);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : (err instanceof Error ? err.message : String(err));
      notifyError(`Failed to ${isEditMode ? "update" : "create"} job: ${msg}`);
    }
  };

  const pageTitle = isEditMode
    ? `Edit ${title || "Job"}`
    : `Create ${
        openingType === "technical" ? "Technical" : "Non-Technical"
      } Job`;

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Skeleton className="h-24 w-full mb-6 rounded-2xl" />
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-4 w-1/2 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-10 pt-6">
      {/* ===== Hero / Page Header ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-5 sm:p-6 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-gray-900 dark:to-purple-500/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-200/40 blur-3xl dark:bg-indigo-500/10" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-purple-200/40 blur-3xl dark:bg-purple-500/10" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-900 dark:ring-white/10">
            <Sparkles className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              {isEditMode ? "Edit Role" : "New Role"}
            </p>
            <h1 className="mt-0.5 text-xl font-bold text-gray-900 sm:text-2xl dark:text-white">
              {isEditMode ? pageTitle : "Create a Job Opening"}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Describe the role, responsibilities, and the interview plan. We&apos;ll build the screening flow around it.
            </p>
          </div>
        </div>
      </div>

      {/* ===== Section title + progress% ===== */}
      <div className="mt-8 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {pageTitle}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Step {step + 1} of 3 <span className="mx-1 text-gray-300">—</span> {STEPS[step].label}
          </p>
        </div>
        <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
          {progressPercent}% complete
        </span>
      </div>

      {/* ===== Stepper ===== */}
      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
        <ol className="flex items-start">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isActive = idx === step;
            const isDone = idx < step;
            const isLast = idx === STEPS.length - 1;
            return (
              <li
                key={s.label}
                className="relative flex flex-1 flex-col items-center text-center"
              >
                {/* Connector reaches from center of this circle to center of the next.
                    Equal-width li's make `w-full` exactly one li-width — i.e. center-to-center. */}
                {!isLast && (
                  <div className="pointer-events-none absolute left-1/2 top-5 h-0.5 w-full -translate-y-1/2 overflow-hidden bg-gray-200 dark:bg-white/10">
                    <div
                      className={cn(
                        "h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500",
                        step > idx ? "w-full" : "w-0"
                      )}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => tryGoToStep(idx)}
                  className={cn(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white transition-all",
                    isActive && "border-indigo-500 bg-indigo-500 text-white shadow-sm ring-4 ring-indigo-100 dark:ring-indigo-500/20",
                    isDone && "border-indigo-500 bg-indigo-500 text-white",
                    !isActive && !isDone && "border-gray-200 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 dark:border-white/10"
                  )}
                >
                  {isDone ? <Check className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                </button>
                <span
                  className={cn(
                    "mt-2 whitespace-nowrap text-xs sm:text-sm font-medium",
                    isActive ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>

        {/* overall progress bar */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ===== STEP 1 - BASIC INFO ===== */}
      {step === 0 && (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
          {/* Start fast banner */}
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-500/30 dark:bg-indigo-500/5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-indigo-100 dark:bg-gray-900 dark:ring-indigo-500/20">
                <Sparkles className="h-4 w-4 text-indigo-500" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Start fast</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Upload a JD to auto-fill, or generate one from scratch with AI.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={open} onOpenChange={(v) => { if (!uploadingJD) setOpen(v); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Upload className="h-4 w-4" />
                    Upload JD
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Job Description</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Label htmlFor="jd-file">Select JD File</Label>
                    <Input
                      id="jd-file"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      disabled={uploadingJD}
                      onChange={(e) =>
                        setUploadJD(e.target.files ? e.target.files[0] : null)
                      }
                    />
                    {uploadingJD && (
                      <p className="text-sm text-blue-600">
                        Scanning and extracting data from your file… This may take a few seconds.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={handleUpload} disabled={!uploadJD || uploadingJD}>
                      {uploadingJD ? "Parsing…" : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setAiJDModalOpen(true)}
                className="gap-1.5 border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:border-indigo-500/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
              >
                <Wand2 className="h-4 w-4" />
                Generate JD
              </Button>
            </div>
          </div>

          {/* Job Title */}
          <div className="mt-6">
            <Label className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-300">
              <FileText className="h-3.5 w-3.5" />
              Job Title <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="e.g. Senior React Developer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2"
              required
            />
          </div>

          {/* Role Details divider */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Role Details
            </span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
          </div>

          {/* Department / Location / Job Type */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                Department
              </Label>
              <Input
                placeholder="e.g. Engineering"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <MapPin className="h-3.5 w-3.5 text-red-400" />
                Location <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Remote or city"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Briefcase className="h-3.5 w-3.5 text-indigo-400" />
                Job Type
              </Label>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue placeholder="Select Job Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full-time">Full-time</SelectItem>
                  <SelectItem value="Part-time">Part-time</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Experience */}
          <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                Experience Level
              </Label>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                {experienceRange[0]} – {experienceRange[1]} yrs
              </span>
            </div>
            <div className="px-1 pt-5">
              <Slider
                value={experienceRange}
                onValueChange={(v: number[]) => setExperienceRange(v)}
                min={0}
                max={20}
                step={1}
              >
                <SliderTrack>
                  <SliderRange />
                </SliderTrack>
                <SliderThumb value={experienceRange[0]} />
                <SliderThumb value={experienceRange[1]} />
              </Slider>
              <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                <span>0 yrs</span>
                <span>5</span>
                <span>10</span>
                <span>15</span>
                <span>20 yrs</span>
              </div>
            </div>
          </div>

          {/* Openings / Employment Type */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <Users className="h-3.5 w-3.5 text-orange-400" />
                Openings
              </Label>
              <Input
                type="number"
                min={1}
                value={openings}
                onChange={(e) => setOpenings(Number(e.target.value))}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                Employment Type
              </Label>
              <Select value={empType} onValueChange={setEmpType}>
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue placeholder="Select Employment Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Permanent">Permanent</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Internship">Internship</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      )}

      {/* ===== STEP 2 - RESPONSIBILITIES ===== */}
      {step === 1 && (
        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-500 ring-1 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20">
                <ListChecks className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Job Responsibilities <span className="text-red-500">*</span>
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  List the day-to-day duties and deliverables. Candidates will see these; be specific.
                </p>
              </div>
            </div>
            <span className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              responsibilityCount > 0
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300"
            )}>
              {responsibilityCount > 0 ? `${responsibilityCount} added` : "At least one required"}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {responsibilities.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5">
                No responsibilities yet — add the first one below.
              </div>
            )}
            {responsibilities.map((r, i) => (
              <div
                key={i}
                className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-indigo-200 hover:shadow-sm dark:border-white/10 dark:bg-gray-900/60"
              >
                <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-xs font-semibold text-purple-600 dark:bg-purple-500/15 dark:text-purple-300">
                  {i + 1}
                </span>
                <Textarea
                  value={r}
                  onChange={(e) => changeResponsibility(i, e.target.value)}
                  rows={1}
                  placeholder="e.g. Design and implement scalable REST APIs using Node.js and Express..."
                  className="min-h-[40px] resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
                />
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="Drag to reorder"
                    className="cursor-grab rounded p-1 text-gray-300 hover:text-gray-500"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteResponsibility(i)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addResponsibility}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-transparent px-4 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-600 dark:border-white/10 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/5 dark:hover:text-indigo-300"
            >
              <Plus className="h-4 w-4" />
              Add another responsibility
            </button>
          </div>
        </section>
      )}

      {/* ===== STEP 3 - INTERVIEW SETUP ===== */}
      {step === 2 && (
        <div className="mt-6 space-y-6">
          {/* ---- Interview Setup card ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <SectionHeader
              iconBg="bg-indigo-50 text-indigo-500 ring-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/20"
              icon={<SlidersHorizontal className="h-5 w-5" />}
              title="Interview Setup"
              description="Pick which features to enable for this role. Toggle what the candidate will experience."
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <FeatureToggle
                id="codeEditor"
                icon={<Code2 className="h-4 w-4" />}
                iconColor="bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300"
                checked={interviewSettings.codeEditor}
                onChange={() => {
                  if (!canUseCodeEditor) {
                    notifyInfo("This feature is available only in the Premium Pro plan. Please contact your admin.");
                    return;
                  }
                  toggleInterviewSetting("codeEditor");
                }}
                disabled={!canUseCodeEditor}
                title="Code Editor Required"
                description="Include a live coding environment."
                rightSlot={!canUseCodeEditor ? (
                  <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                    <Lock className="h-3 w-3" /> Pro
                  </span>
                ) : null}
              />
              <FeatureToggle
                id="allowFromMobile"
                icon={<Smartphone className="h-4 w-4" />}
                iconColor="bg-sky-50 text-sky-500 dark:bg-sky-500/15 dark:text-sky-300"
                checked={interviewSettings.allowFromMobile}
                onChange={() => toggleInterviewSetting("allowFromMobile")}
                title="Allow from Mobile"
                description="Candidates can take the interview on phone."
              />
              <FeatureToggle
                id="enableVirtualAvatar"
                icon={<UserCircle2 className="h-4 w-4" />}
                iconColor="bg-violet-50 text-violet-500 dark:bg-violet-500/15 dark:text-violet-300"
                checked={interviewSettings.enableVirtualAvatar}
                onChange={() => toggleInterviewSetting("enableVirtualAvatar")}
                title="Enable Virtual Avatar"
                description="AI-driven avatar asks questions on camera."
              />
              <FeatureToggle
                id="faceMatchRequired"
                icon={<ScanFace className="h-4 w-4" />}
                iconColor="bg-rose-50 text-rose-500 dark:bg-rose-500/15 dark:text-rose-300"
                checked={interviewSettings.faceMatchRequired}
                onChange={() => toggleInterviewSetting("faceMatchRequired")}
                title="Face Match Required"
                description="Verify identity against a reference photo."
              />
              <FeatureToggle
                id="resumeBased"
                icon={<FileText className="h-4 w-4" />}
                iconColor="bg-blue-50 text-blue-500 dark:bg-blue-500/15 dark:text-blue-300"
                checked={interviewSettings.resumeBased}
                onChange={() => toggleInterviewSetting("resumeBased")}
                title="Interview based on Resume"
                description="Questions are generated from the candidate's resume."
              />
              <FeatureToggle
                id="manualInterview"
                icon={<UserCog className="h-4 w-4" />}
                iconColor="bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300"
                checked={interviewSettings.manualInterview}
                onChange={() => toggleInterviewSetting("manualInterview")}
                title="Manual Interview"
                description="Let a recruiter conduct the interview instead of AI."
              />
            </div>

            <div className="mt-6">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <Video className="h-3.5 w-3.5" />
                Web Cam Settings
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FeatureToggle
                  id="webCamRequired"
                  icon={<Video className="h-4 w-4" />}
                  iconColor="bg-indigo-50 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300"
                  checked={interviewSettings.webCamRequired}
                  onChange={() => toggleInterviewSetting("webCamRequired")}
                  title="Web Cam Required"
                  description="Camera must stay on during interview."
                />
                <FeatureToggle
                  id="secondaryCamVerification"
                  icon={<Camera className="h-4 w-4" />}
                  iconColor="bg-teal-50 text-teal-500 dark:bg-teal-500/15 dark:text-teal-300"
                  checked={interviewSettings.secondaryCamVerification}
                  onChange={() => toggleInterviewSetting("secondaryCamVerification")}
                  title="Secondary Camera"
                  description="Use a phone as a proctoring camera."
                />
              </div>
            </div>
          </section>

          {/* ---- Assigned Manager ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <SectionHeader
              iconBg="bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
              icon={<UsersRound className="h-5 w-5" />}
              title={<>Assigned Manager <span className="text-red-500">*</span></>}
              description="The hiring manager responsible for this opening."
              rightSlot={!manager.name.trim() ? (
                <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-500 dark:bg-red-500/15 dark:text-red-300">
                  Name required
                </span>
              ) : null}
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-sm text-indigo-600 dark:text-indigo-300">Name <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="e.g. Deepak Rawat"
                  value={manager.name}
                  onChange={(e) => setManager((m) => ({ ...m, name: e.target.value }))}
                  className="mt-2"
                  required
                />
              </div>
              <div>
                <Label className="text-sm text-indigo-600 dark:text-indigo-300">Phone Number</Label>
                <Input
                  placeholder="Phone Number"
                  type="tel"
                  value={manager.phone}
                  onChange={(e) => setManager((m) => ({ ...m, phone: e.target.value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="text-sm text-indigo-600 dark:text-indigo-300">Email</Label>
                <Input
                  placeholder="name@company.com"
                  type="email"
                  value={manager.email}
                  onChange={(e) => setManager((m) => ({ ...m, email: e.target.value }))}
                  className="mt-2"
                />
              </div>
            </div>

            <label
              htmlFor="allowCandidateContact"
              className={cn(
                "mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                interviewSettings.allowCandidateContact
                  ? "border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/10"
                  : "border-gray-200 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900/60 dark:hover:bg-white/5"
              )}
            >
              <Checkbox
                id="allowCandidateContact"
                checked={interviewSettings.allowCandidateContact}
                onCheckedChange={() => toggleInterviewSetting("allowCandidateContact")}
                className="mt-0.5"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Allow candidate to contact you</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Show your contact details to candidates during the interview.
                </p>
              </div>
            </label>
          </section>

          {/* ---- Additional Settings ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <SectionHeader
              iconBg="bg-amber-50 text-amber-500 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20"
              icon={<SlidersHorizontal className="h-5 w-5" />}
              title="Additional Settings"
              description="Fine-tune how the AI conducts the interview."
            />

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-200">Interview Mode</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      {questionType === "traditional"
                        ? "This mode presents standard, direct questions focused on a candidate's experience, technical knowledge, and problem-solving approach. These are typically used in structured interviews and assess how well candidates understand key concepts, tools, and past project situations. Ideal for evaluating fundamental competency, communication clarity, and practical awareness."
                        : "This mode presents in-depth, real-world scenarios to evaluate how candidates approach complex, open-ended situations in practical settings. Each question is framed within a realistic context to simulate challenges one might face on the job. It is designed to assess critical thinking, structured problem-solving, and the ability to navigate ambiguity. Interviews in this mode typically take 15–20 minutes longer than the traditional format due to the depth and detail involved."}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Tabs
                  value={questionType}
                  onValueChange={(val) => setQuestionType(val as "traditional" | "scenario")}
                  className="mt-2 w-full"
                >
                  <TabsList className="flex rounded-full bg-gray-100 p-1 dark:bg-white/5">
                    <TabsTrigger
                      value="traditional"
                      className="flex-1 rounded-full text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Traditional
                    </TabsTrigger>
                    <TabsTrigger
                      value="scenario"
                      className="flex-1 rounded-full text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-sm"
                    >
                      Scenario Based
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  Max Number of Questions to Ask
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={maxQuestions}
                  onChange={(e) => setMaxQuestions(Number(e.target.value))}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  Auto Skip Timeout (mm:ss)
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      Set the time the AI will wait for the candidate to answer before automatically skipping to the next question. If set to &quot;Off&quot;, the candidate can take unlimited time per question.
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {autoSkipSeconds === 0 ? "Off" : formatMmSs(autoSkipSeconds)}
                </span>
              </div>
              <div className="px-1 pt-5">
                <Slider
                  value={[autoSkipSeconds]}
                  onValueChange={(v: number[]) => setAutoSkipSeconds(v[0])}
                  min={0}
                  max={90}
                  step={15}
                >
                  <SliderTrack>
                    <SliderRange />
                  </SliderTrack>
                  <SliderThumb value={autoSkipSeconds} />
                </Slider>
                <div className="mt-2 flex justify-between text-[11px] text-gray-400">
                  {[0, 15, 30, 45, 60, 75, 90].map((v) => (
                    <span key={v}>{v === 0 ? "Off" : formatMmSs(v)}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-200">Special Instructions</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-md">
                    Use this field to input any additional guidelines or focus areas for the AI when crafting questions. For example, you can specify the industry domain relevant to the job position, or highlight particular aspects of the job description that should be emphasized. This information helps tailor the AI&apos;s questioning to better align with the job&apos;s specific requirements and the candidate&apos;s background. It ensures a more targeted and relevant assessment by directing the AI to consider these special instructions alongside the skills and experience levels mentioned in the candidate&apos;s form.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Textarea
                placeholder={"e.g.\n• Focus on React and Node.js practical knowledge\n• Ask about experience with microservices architecture\n• Evaluate problem-solving under time pressure"}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                rows={4}
                className="mt-2"
              />
            </div>
          </section>

          {/* ---- Evaluation Scoring ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <SectionHeader
              iconBg="bg-rose-50 text-rose-500 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20"
              icon={<Target className="h-5 w-5" />}
              title="Evaluation Scoring"
              description="How strict should the AI be when scoring candidate answers?"
            />

            <div className="mt-5 space-y-4">
              <div>
                <Label htmlFor="scoringLeniency" className="text-sm text-indigo-600 dark:text-indigo-300">
                  Scoring Leniency
                </Label>
                <Select value={scoringLeniency} onValueChange={setScoringLeniency}>
                  <SelectTrigger id="scoringLeniency" className="mt-2 w-full sm:w-64">
                    <SelectValue placeholder="Select Scoring Leniency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard Evaluation">Standard Evaluation</SelectItem>
                    <SelectItem value="Lenient">Lenient</SelectItem>
                    <SelectItem value="Strict">Strict</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <RadioGroup
                value={scoringCustomInstructions ? "custom" : "default"}
                onValueChange={(value) => setScoringCustomInstructions(value === "custom")}
                className="flex flex-wrap gap-2"
              >
                <OptionPill id="scoring-default" value="default" label="Default" />
                <OptionPill id="scoring-custom" value="custom" label="Add Custom Instructions" />
              </RadioGroup>

              {scoringCustomInstructions && (
                <Textarea
                  placeholder="Custom scoring instructions"
                  value={scoringCustomText}
                  onChange={(e) => setScoringCustomText(e.target.value)}
                />
              )}
            </div>
          </section>

          {/* ---- Custom Questions ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <SectionHeader
              iconBg="bg-purple-50 text-purple-500 ring-purple-100 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20"
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="Custom Questions"
              description="Add your own questions or pull from the question bank."
            />

            <RadioGroup
              value={customQuestionsMode}
              onValueChange={(value: "mix" | "only" | "ai_only") => setCustomQuestionsMode(value)}
              className="mt-5 flex flex-wrap gap-2"
            >
              <OptionPill id="questions-ai-only" value="ai_only" label="Only AI questions" />
              <OptionPill id="questions-mix" value="mix" label="Mix of these & AI" />
              <OptionPill id="questions-only" value="only" label="Only these questions" />
            </RadioGroup>

            {customQuestionsMode !== "ai_only" && (
              <div className="mt-5 space-y-3">
                {customQuestions.map((q, i) => (
                  <div key={i} className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 pl-3 hover:border-indigo-200 dark:border-white/10 dark:bg-gray-900/60">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-50 text-[10px] font-semibold text-purple-600 dark:bg-purple-500/15 dark:text-purple-300">
                      {i + 1}
                    </span>
                    <Input
                      value={q.text}
                      onChange={(e) => updateCustomQuestion(i, e.target.value)}
                      placeholder={`Question ${i + 1}`}
                      className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCustomQuestion(i)}
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="primary" size="sm" onClick={() => addCustomQuestion()} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Question
                  </Button>
                  <Button variant="primary" size="sm" onClick={openQuestionBank} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add from Q Bank
                  </Button>
                  <Button variant="primary" size="sm" onClick={openQuestionBank} className="gap-1.5">
                    <ListChecks className="h-4 w-4" />
                    Select from Q Bank
                  </Button>
                </div>
              </div>
            )}

            {customQuestionsMode === "ai_only" && (
              <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                AI will generate all questions dynamically during the interview based on the job title, skills, and experience requirements configured above.
              </p>
            )}

            {showQuestionBank && (
              <div className="mt-6 rounded-xl border border-gray-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Questions Bank</h4>
                  <Button variant="ghost" size="sm" onClick={() => setShowQuestionBank(false)}>
                    ×
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="category" className="text-xs font-medium">Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {extractedQuestionCategories.map((category: string) => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="difficulty" className="text-xs font-medium">Difficulty</Label>
                    <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Difficulties</SelectItem>
                        {extractedDifficultyOptions.map((diff: string) => (
                          <SelectItem key={diff} value={diff}>
                            {diff.charAt(0).toUpperCase() + diff.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="count" className="text-xs font-medium">Number of Questions</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={questionsCount}
                      onChange={(e) => setQuestionsCount(parseInt(e.target.value) || 1)}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-end gap-2">
                    <Button variant="primary" size="sm" onClick={addRandomQuestions} disabled={filteredQuestions.length === 0}>
                      Add {questionsCount}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setShowQuestionBank(false); setSelectedQuestionIds(new Set()); }}>
                      Cancel
                    </Button>
                  </div>
                </div>

                {selectedQuestionIds.size > 0 && (
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <span className="text-sm font-medium">{selectedQuestionIds.size} questions selected</span>
                    <Button variant="primary" size="sm" onClick={addSelectedQuestions}>Add Selected</Button>
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-gray-900/60">
                  <div className="border-b bg-gray-50 p-3 dark:border-white/10 dark:bg-white/5">
                    <h5 className="text-sm font-medium">Available Questions ({filteredQuestions.length})</h5>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredQuestions.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        No questions found matching your criteria
                      </div>
                    ) : (
                      filteredQuestions.map((question) => (
                        <div
                          key={question.id}
                          className={cn(
                            "cursor-pointer border-b p-3 transition-colors hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5",
                            selectedQuestionIds.has(question.id) && "bg-blue-50/60 dark:bg-blue-500/10"
                          )}
                          onClick={() => toggleQuestionSelection(question.id)}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedQuestionIds.has(question.id)}
                              onCheckedChange={() => toggleQuestionSelection(question.id)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <p className="text-sm">{question.text}</p>
                              <div className="mt-1 flex gap-2">
                                {question.category && (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/10 dark:text-gray-300">
                                    {question.category}
                                  </span>
                                )}
                                {question.difficulty && (
                                  <span className={cn(
                                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                    question.difficulty === "advanced" && "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                                    question.difficulty === "intermediate" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
                                    question.difficulty !== "advanced" && question.difficulty !== "intermediate" && "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                                  )}>
                                    {question.difficulty}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomQuestions((prev) => [
                                  ...prev,
                                  {
                                    text: question.text,
                                    category: question.category || "general",
                                    difficulty: question.difficulty || "medium"
                                  }
                                ]);
                                notifySuccess("Question added to custom questions");
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ---- Skills to Test ---- */}
          <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader
                iconBg="bg-emerald-50 text-emerald-500 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/20"
                icon={<Target className="h-5 w-5" />}
                title={<>Skills to Test <span className="text-red-500">*</span></>}
                description="Group skills and mark which ones are mandatory for this role."
                rightSlot={!hasAtLeastOneSkill ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-500 dark:bg-red-500/15 dark:text-red-300">
                    At least one required
                  </span>
                ) : null}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="primary" size="sm" onClick={addSkillGroup} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Skill Group
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              {skillGroups.map((group) => (
                <div key={group.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-gray-900/60">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpansion(group.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10"
                    >
                      {expandedGroups.has(group.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <Input
                      value={group.name}
                      onChange={(e) => updateSkillGroupName(group.id, e.target.value)}
                      placeholder="Skill Group Name"
                      className="font-medium"
                    />
                    <Button variant="ghost" size="icon" onClick={() => deleteSkillGroup(group.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>

                  {expandedGroups.has(group.id) && (
                    <div className="mt-4 space-y-4 pl-9">
                      <div className="space-y-2">
                        {group.skills.map((skill, skillIndex) => (
                          <div key={skillIndex} className="flex items-center gap-2">
                            <Input
                              value={skill}
                              onChange={(e) => updateSkillInGroup(group.id, skillIndex, e.target.value)}
                              placeholder="Skill e.g. Wireframing"
                            />
                            <Button variant="ghost" size="icon" onClick={() => deleteSkillFromGroup(group.id, skillIndex)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="primary" size="sm" onClick={() => addSkillToGroup(group.id)} className="gap-1.5">
                          <Plus className="h-4 w-4" />
                          Add Skill
                        </Button>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium">Criteria for this group</p>
                        <RadioGroup
                          value={group.skill_criteria}
                          onValueChange={(value: "All Mandatory" | "At Least One" | "None") => updateSkillGroupCriteria(group.id, value)}
                          className="flex flex-col gap-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="All Mandatory" id={`${group.id}-all`} />
                            <Label htmlFor={`${group.id}-all`}>All skills mandatory</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="At Least One" id={`${group.id}-one`} />
                            <Label htmlFor={`${group.id}-one`}>At least one mandatory</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="None" id={`${group.id}-none`} />
                            <Label htmlFor={`${group.id}-none`}>None mandatory</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {skillGroups.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5">
                  No skill groups yet. Click &quot;Add Skill Group&quot; to get started.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ===== Sticky bottom nav (stays within the content column) ===== */}
      <div className="sticky bottom-4 z-40 mt-8">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/95 p-2 pl-3 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:border-white/10 dark:bg-gray-900/95">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={step === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>

          <span className="hidden text-xs text-gray-500 sm:block dark:text-gray-400">
            Step <span className="font-semibold text-gray-900 dark:text-white">{step + 1}</span> of 3
          </span>

          {step === 2 ? (
            <Button variant="primary" size="sm" onClick={handleSubmit} className="gap-1.5">
              <Check className="h-4 w-4" />
              {isEditMode ? "Update Job" : "Save & Done"}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleNext} className="gap-1.5">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* AI JD Generation Modal */}
      <AIJDModal
        isOpen={aiJDModalOpen}
        onClose={() => setAiJDModalOpen(false)}
        onJDGenerated={handleJDGenerated}
      />
    </div>
  );
}

/* =========================================================
   Local presentational helpers
   ========================================================= */
function SectionHeader({
  icon,
  iconBg,
  title,
  description,
  rightSlot,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1", iconBg)}>
          {icon}
        </span>
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
      </div>
      {rightSlot}
    </div>
  );
}

function FeatureToggle({
  id,
  icon,
  iconColor,
  title,
  description,
  checked,
  onChange,
  disabled,
  rightSlot,
}: {
  id: string;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all",
        checked
          ? "border-indigo-300 bg-indigo-50/60 shadow-sm dark:border-indigo-500/40 dark:bg-indigo-500/10"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-white/10 dark:bg-gray-900/60 dark:hover:bg-white/5",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", iconColor)}>
        {icon}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
          {rightSlot}
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </label>
  );
}

function OptionPill({ id, value, label }: { id: string; value: string; label: string }) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/40 has-[[data-state=checked]]:border-indigo-300 has-[[data-state=checked]]:bg-indigo-50/60 has-[[data-state=checked]]:text-indigo-700 dark:border-white/10 dark:bg-gray-900/60 dark:hover:bg-white/5 dark:has-[[data-state=checked]]:border-indigo-500/40 dark:has-[[data-state=checked]]:bg-indigo-500/10 dark:has-[[data-state=checked]]:text-indigo-300"
    >
      <RadioGroupItem value={value} id={id} />
      <span>{label}</span>
    </label>
  );
}
