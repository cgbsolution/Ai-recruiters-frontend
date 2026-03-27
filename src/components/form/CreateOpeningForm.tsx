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
import { Card, CardContent } from "@/components/ui/card";
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
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  TrashIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  Info,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// --- Config
import { api, apiPost, apiUpload, ApiError } from "@/lib/api";

type SkillGroup = {
  id: string;
  name: string;
  skills: string[];
  skill_criteria: "All Mandatory" | "At Least One" | "None";
};

interface CreateOpeningFormProps {
  jobId?: string;
}

export default function CreateOpeningForm({ jobId }: CreateOpeningFormProps) {
  const searchParams = useSearchParams();
  const openingType = searchParams?.get("openingType") || "technical";
  const router = useRouter();
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
  const [experienceLevel, setExperienceLevel] = useState<string>("Mid");
  const [openings, setOpenings] = useState<number>(1);
  const [empType, setEmpType] = useState<string>("Permanent");
  const [uploadJD, setUploadJD] = useState<File | null>(null);
  const [open, setOpen] = useState(false);

  // ---------- STEP 2 (Responsibilities) ----------
  const [responsibilities, setResponsibilities] = useState<string[]>([]);

  // ---------- STEP 3 (Interview Setup + bottom: Skills & Criteria) ----------
  const [interviewSettings, setInterviewSettings] = useState({
    codeEditor: true,
    allowFromMobile: false,
    enableVirtualAvatar: true,
    resumeBased: true,
    manualInterview: false,
    faceMatchRequired: false,
    webCamRequired: true,
    secondaryCamVerification: false,
    allowCandidateContact: false,
  });

  const [manager, setManager] = useState({ name: "", phone: "", email: "" });
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
    "mix" | "only"
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

    if (jd.special_instructions) {
      setSpecialInstructions(jd.special_instructions);
    }

    const qCount = jd.coding_questions_count ?? 5;
    setMaxQuestions(qCount);

    // ── Auto-generate interview questions from the AI JD ──────────────────
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
    setInterviewSettings((s) => ({ ...s, [key]: !s[key] }));

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
  // Fetch all questions from the API
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

  // Filter questions when category/difficulty changes
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

  // Toggle question selection
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

  // Add random questions based on count
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

  // Add specific selected questions
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

  // Initialize question bank data
  const openQuestionBank = () => {
    setShowQuestionBank(true);
    setSelectedQuestionIds(new Set());
    setSelectedCategory("all");
    setSelectedDifficulty("all");
    setQuestionsCount(5);
    // Fetch latest data when opening
    fetchAllQuestions();
  };

  // ---------- Enhanced Validation / step completion (3 steps) ----------
  const stepCompleted = useMemo(() => {
    const s0 =
      title.trim().length > 0 &&
      department.trim().length > 0 &&
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
      manager.name.trim().length > 0; // Manager name is required

    return [s0, s1, s2];
  }, [
    title,
    department,
    location,
    openings,
    empType,
    responsibilities,
    interviewSettings,
    manager,
    skillGroups,
    specialInstructions,
  ]);

  // Check specific required fields for better error messages
  const checkStepRequirements = (targetStep: number): boolean => {
    switch (targetStep) {
      case 0:
        if (!title.trim()) {
          notifyError("Job Title is required");
          return false;
        }
        if (!department.trim()) {
          notifyError("Department is required");
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
    // Allow going backward freely
    if (target <= step) {
      setStep(target);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // For forward navigation, validate all steps before the target
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

  // Fetch job data for edit mode
  useEffect(() => {
    if (isEditMode && jobId) {
      const fetchJobData = async () => {
        try {
          setLoading(true);
          const jobData = await api<any>(`/jobs/${jobId}`);

          // Populate form with existing data
          setTitle(jobData.title || "");
          setDepartment(jobData.department || "");
          setLocation(jobData.location || "");
          setJobType(jobData.job_type || "Full-time");
          setOpenings(jobData.openings || 1);
          setEmpType(jobData.emp_type || "Permanent");

          // Set experience range
          if (
            jobData.experience_min !== undefined &&
            jobData.experience_max !== undefined
          ) {
            setExperienceRange([
              jobData.experience_min,
              jobData.experience_max,
            ]);
          }

          // Set responsibilities
          if (jobData.responsibilities) {
            setResponsibilities(
              jobData.responsibilities.map((r: any) => r.description || "")
            );
          }

          // Set interview settings
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

          // Set manager info
          setManager({
            name: jobData.manager_name || "",
            phone: jobData.manager_phone || "",
            email: jobData.manager_email || "",
          });

          // Set question settings
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

          // Set custom questions
          if (jobData.questions) {
            setCustomQuestions(jobData.questions.map((q: any) => ({
              text: q.text || "",
              category: q.category || "general",
              difficulty: q.difficulty || "medium"
            })));
          }
          setCustomQuestionsMode(
            jobData.mix_of_questions === "ONLY" ? "only" : "mix"
          );

          // Set skill groups
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

  // ---------- Submit (single payload to API_URL) ----------
  const handleSubmit = async () => {
    // Final validation before submit
    if (!title.trim()) {
      notifyError("Please enter a job title.");
      setStep(0);
      return;
    }
    if (!department.trim()) {
      notifyError("Please enter a department.");
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

    // build interview_settings nested object (single source of truth)
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

    // mapping skills
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
      mix_of_questions: customQuestionsMode === "mix" ? "MIX" : "ONLY",
      questions: customQuestions, // Now includes category and difficulty
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

      notifySuccess(`Job ${isEditMode ? "Updated" : "Created"} Successfully!`);
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.detail : (err instanceof Error ? err.message : String(err));
      notifyError(`Failed to ${isEditMode ? "update" : "create"} job: ${msg}`);
    }
  };

  // Update the page title based on mode
  const pageTitle = isEditMode
    ? `Edit ${title || "Job"}`
    : `Create ${
        openingType === "technical" ? "Technical" : "Non-Technical"
      } Job`;

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-4 w-1/2 mb-8" />
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">{pageTitle}</h1>

      {/* Progress indicator (4 steps) */}
      <div className="mb-4">
        <Tabs
          value={String(step)}
          onValueChange={(v) => {
            const target = parseInt(v, 10);
            tryGoToStep(target);
          }}
        >
          <TabsList className="flex w-full gap-2">
            <TabsTrigger value="0">Basic Info</TabsTrigger>
            <TabsTrigger value="1">Responsibilities</TabsTrigger>
            <TabsTrigger value="2">Interview Setup</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Visual progress bar under tabs */}
        <div className="w-full bg-slate-100 h-2 rounded-full mt-3">
          <div
            className="h-2 rounded-full bg-[#465fff] transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ---------- STEP 1 - BASIC INFO ---------- */}
      {step === 0 && (
        <Card className="mt-6">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center justify-between">
              <div className="flex gap-2 items-center">
                {/* Upload JD Button with Dialog */}
                <Dialog open={open} onOpenChange={(v) => { if (!uploadingJD) setOpen(v); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Upload Job Description ⬆️</Button>
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

                {/* Generate JD Button */}
                <Button
                  variant="outline"
                  onClick={() => setAiJDModalOpen(true)}
                >
                  Generate JD ⚡
                </Button>
              </div>
            </div>

            {/* Title */}
            <div>
              <Label className="block text-sm font-medium mb-2">
                Job Title <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="Enter Job Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            {/* Department & Location & Job Type */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="block text-sm font-medium mb-2">
                  Department <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">
                  Location <span className="text-red-500">*</span>
                </Label>
                <Input
                  placeholder="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label className="block text-sm font-medium mb-2">
                  Job Type
                </Label>
                <Select value={jobType} onValueChange={setJobType}>
                  <SelectTrigger className="w-full">
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
            <div>
              <Label className="block text-sm font-medium mb-2">
                Experience Level ({experienceRange[0]} - {experienceRange[1]}{" "}
                Years)
              </Label>
              <div className="py-4">
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
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>0 yrs</span>
                  <span>20 yrs</span>
                </div>
              </div>
            </div>

            {/* Openings & Employment Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="block text-sm font-medium mb-2">
                  Openings
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={openings}
                  onChange={(e) => setOpenings(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="block text-sm font-medium mb-2">
                  Employment Type
                </Label>
                <Select value={empType} onValueChange={setEmpType}>
                  <SelectTrigger className="w-full">
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
          </CardContent>
        </Card>
      )}

      {/* ---------- STEP 2 - RESPONSIBILITIES ---------- */}
      {step === 1 && (
        <Card className="mt-6">
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Job Responsibilities <span className="text-red-500">*</span></h2>
              {responsibilities.filter((r) => r.trim().length > 0).length === 0 && (
                <span className="text-sm text-red-500">At least one responsibility required</span>
              )}
            </div>
            <div className="space-y-3 mt-2">
              {responsibilities.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-slate-50 rounded-lg p-3 border"
                >
                  <Textarea
                    value={r}
                    onChange={(e) => changeResponsibility(i, e.target.value)}
                    rows={2}
                    placeholder="Enter job responsibility..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteResponsibility(i)}
                  >
                    <TrashIcon className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="primary"
              onClick={addResponsibility}
              className="mt-3"
            >
              Add Responsibility
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------- STEP 3 - INTERVIEW SETUP (+ Skills bottom) ---------- */}
      {step === 2 && (
        <Card className="mt-6">
          <CardContent className="">
            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <h2 className="text-lg font-medium">Interview Setup</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="codeEditor"
                      checked={interviewSettings.codeEditor}
                      onCheckedChange={() =>
                        toggleInterviewSetting("codeEditor")
                      }
                    />
                    <Label htmlFor="codeEditor">Code Editor Required</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="allowFromMobile"
                      checked={interviewSettings.allowFromMobile}
                      onCheckedChange={() =>
                        toggleInterviewSetting("allowFromMobile")
                      }
                    />
                    <Label htmlFor="allowFromMobile">
                      Allow Interview From Mobile
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableVirtualAvatar"
                      checked={interviewSettings.enableVirtualAvatar}
                      onCheckedChange={() =>
                        toggleInterviewSetting("enableVirtualAvatar")
                      }
                    />
                    <Label htmlFor="enableVirtualAvatar">
                      Enable Virtual Avatar
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="faceMatchRequired"
                      checked={interviewSettings.faceMatchRequired}
                      onCheckedChange={() =>
                        toggleInterviewSetting("faceMatchRequired")
                      }
                    />
                    <Label htmlFor="faceMatchRequired">
                      Face Match Required
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="resumeBased"
                      checked={interviewSettings.resumeBased}
                      onCheckedChange={() =>
                        toggleInterviewSetting("resumeBased")
                      }
                    />
                    <Label htmlFor="resumeBased">
                      Interview based on Resume
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="manualInterview"
                      checked={interviewSettings.manualInterview}
                      onCheckedChange={() =>
                        toggleInterviewSetting("manualInterview")
                      }
                    />
                    <Label htmlFor="manualInterview">Manual Interview</Label>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium pb-4">Web Cam Settings</h3>
                  <div className="flex gap-6 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="webCamRequired"
                        checked={interviewSettings.webCamRequired}
                        onCheckedChange={() =>
                          toggleInterviewSetting("webCamRequired")
                        }
                      />
                      <Label htmlFor="webCamRequired">Web Cam Required</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="secondaryCamVerification"
                        checked={interviewSettings.secondaryCamVerification}
                        onCheckedChange={() =>
                          toggleInterviewSetting("secondaryCamVerification")
                        }
                      />
                      <Label htmlFor="secondaryCamVerification">
                        Secondary Camera Verification
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Assigned Manager <span className="text-red-500">*</span></h3>
                    {!manager.name.trim() && (
                      <span className="text-sm text-red-500">Manager name is required</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <Input
                      placeholder="Name *"
                      value={manager.name}
                      onChange={(e) =>
                        setManager((m) => ({ ...m, name: e.target.value }))
                      }
                      required
                    />
                    <Input
                      placeholder="Phone Number"
                      type="number"
                      value={manager.phone}
                      onChange={(e) =>
                        setManager((m) => ({ ...m, phone: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Email ID"
                      type="email"
                      value={manager.email}
                      onChange={(e) =>
                        setManager((m) => ({ ...m, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <Checkbox
                      id="allowCandidateContact"
                      checked={interviewSettings.allowCandidateContact}
                      onCheckedChange={() =>
                        toggleInterviewSetting("allowCandidateContact")
                      }
                    />
                    <Label htmlFor="allowCandidateContact">
                      Allow candidate to contact you
                    </Label>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <h3 className="font-medium">Additional Settings</h3>

                <div className="mt-2 flex items-center gap-6">
                  {/* Tabs for Question Type */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Interview Mode:</Label>
                    <Tabs
                      value={questionType}
                      onValueChange={(val) =>
                        setQuestionType(val as "traditional" | "scenario")
                      }
                      className="w-auto"
                    >
                      <TabsList className="bg-gray-100 rounded-full p-1 flex space-x-1">
                        <TabsTrigger
                          value="traditional"
                          className="text-gray-500 hover:text-gray-900 data-[state=active]:bg-[#465fff] data-[state=active]:text-white rounded-full px-3 py-1"
                        >
                          Traditional
                        </TabsTrigger>

                        <TabsTrigger
                          value="scenario"
                          className="text-gray-500 hover:text-gray-900 data-[state=active]:bg-[#465fff] data-[state=active]:text-white rounded-full px-3 py-1"
                        >
                          Scenario Based
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        {questionType === "traditional"
                          ? "This mode presents standard, direct questions focused on a candidate's experience, technical knowledge, and problem-solving approach. These are typically used in structured interviews and assess how well candidates understand key concepts, tools, and past project situations. Ideal for evaluating fundamental competency, communication clarity, and practical awareness."
                          : "This mode presents in-depth, real-world scenarios to evaluate how candidates approach complex, open-ended situations in practical settings. Each question is framed within a realistic context to simulate challenges one might face on the job. It is designed to assess critical thinking, structured problem-solving, and the ability to navigate ambiguity. Interviews in this mode typically take 15\u201320 minutes longer than the traditional format due to the depth and detail involved."}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Number Input for Max Questions */}
                  <div>
                    <Label className="text-sm block">
                      Max Number of Questions to Ask
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={maxQuestions}
                      onChange={(e) => setMaxQuestions(Number(e.target.value))}
                      className="mt-1 w-50"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm font-medium">
                      Auto Skip Timeout (mm:ss): {formatMmSs(autoSkipSeconds)}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        Set the time the AI will wait for the candidate to answer before automatically skipping to the next question. If set to &quot;Off&quot;, the candidate can take unlimited time per question.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    {[0, 15, 30, 45, 60, 75, 90].map((v) => (
                      <span key={v}>{v === 0 ? "Off" : formatMmSs(v)}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm font-medium">
                      Special Instructions
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-4 h-4 text-gray-400 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                        Use this field to input any additional guidelines or focus areas for the AI when crafting questions. For example, you can specify the industry domain relevant to the job position, or highlight particular aspects of the job description that should be emphasized. This information helps tailor the AI&apos;s questioning to better align with the job&apos;s specific requirements and the candidate&apos;s background. It ensures a more targeted and relevant assessment by directing the AI to consider these special instructions alongside the skills and experience levels mentioned in the candidate&apos;s form.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Textarea
                    placeholder="Input your more Details"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <div className="mt-4">
                  <h4 className="font-medium">Evaluation Scoring Settings</h4>

                  {/* Scoring Leniency */}
                  <div className="mt-2">
                    <Label htmlFor="scoringLeniency" className="block text-sm">
                      Scoring Leniency
                    </Label>
                    <Select
                      value={scoringLeniency}
                      onValueChange={setScoringLeniency}
                    >
                      <SelectTrigger id="scoringLeniency" className="mt-1 w-52">
                        <SelectValue placeholder="Select Scoring Leniency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Standard Evaluation">
                          Standard Evaluation
                        </SelectItem>
                        <SelectItem value="Lenient">Lenient</SelectItem>
                        <SelectItem value="Strict">Strict</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Radio Group for Default / Custom Instructions */}
                  <div className="mt-2">
                    <RadioGroup
                      value={scoringCustomInstructions ? "custom" : "default"}
                      onValueChange={(value) =>
                        setScoringCustomInstructions(value === "custom")
                      }
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="default" id="scoring-default" />
                        <Label htmlFor="scoring-default">Default</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="custom" id="scoring-custom" />
                        <Label htmlFor="scoring-custom">
                          Add Custom Instructions
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Custom Instructions Textarea */}
                  {scoringCustomInstructions && (
                    <div className="mt-2">
                      <Textarea
                        placeholder="Custom scoring instructions"
                        value={scoringCustomText}
                        onChange={(e) => setScoringCustomText(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <div className="mt-4">
                  <h4 className="font-medium">Custom Questions</h4>

                  <div className="mt-2">
                    <RadioGroup
                      value={customQuestionsMode}
                      onValueChange={(value: "mix" | "only") =>
                        setCustomQuestionsMode(value)
                      }
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="mix" id="questions-mix" />
                        <Label htmlFor="questions-mix">
                          Mix of these questions and AI questions
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="only" id="questions-only" />
                        <Label htmlFor="questions-only">
                          Only these questions
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Custom Questions List */}
                  <div className="mt-3 space-y-2">
                    {customQuestions.map((q, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={q.text}
                          onChange={(e) =>
                            updateCustomQuestion(i, e.target.value)
                          }
                          placeholder={`Question ${i + 1}`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCustomQuestion(i)}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    ))}

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="primary"
                        onClick={() => addCustomQuestion()}
                      >
                        Add Question
                      </Button>
                      <Button variant="primary" onClick={openQuestionBank}>
                        Add Question from Q Bank
                      </Button>
                      <Button variant="primary" onClick={openQuestionBank}>
                        Select specific Question from Q Bank
                      </Button>
                    </div>
                  </div>

                  {/* Question Bank Section - Displayed when active */}
                  {showQuestionBank && (
                    <div className="mt-6 p-4 border rounded-lg bg-slate-50">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium">Questions Bank</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowQuestionBank(false)}
                        >
                          ×
                        </Button>
                      </div>

                      {/* Filters */}
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <Label
                            htmlFor="category"
                            className="text-sm font-medium"
                          >
                            Category
                          </Label>
                          <Select
                            value={selectedCategory}
                            onValueChange={setSelectedCategory}
                          >
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All Categories
                              </SelectItem>
                              {extractedQuestionCategories.map(
                                (category: string) => (
                                  <SelectItem key={category} value={category}>
                                    {category}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label
                            htmlFor="difficulty"
                            className="text-sm font-medium"
                          >
                            Difficulty
                          </Label>
                          <Select
                            value={selectedDifficulty}
                            onValueChange={setSelectedDifficulty}
                          >
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue placeholder="Select difficulty" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">
                                All Difficulties
                              </SelectItem>
                              {extractedDifficultyOptions.map(
                                (diff: string) => (
                                  <SelectItem key={diff} value={diff}>
                                    {diff.charAt(0).toUpperCase() +
                                      diff.slice(1)}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label
                            htmlFor="count"
                            className="text-sm font-medium"
                          >
                            Number of Questions
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            max="50"
                            value={questionsCount}
                            onChange={(e) =>
                              setQuestionsCount(parseInt(e.target.value) || 1)
                            }
                            className="mt-1"
                          />
                        </div>

                        <div className="flex items-end gap-2">
                          <Button
                            variant="primary"
                            onClick={addRandomQuestions}
                            disabled={filteredQuestions.length === 0}
                          >
                            Add {questionsCount} Questions
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowQuestionBank(false);
                              setSelectedQuestionIds(new Set());
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>

                      {/* Selected Questions Display */}
                      {selectedQuestionIds.size > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">
                              {selectedQuestionIds.size} questions selected
                            </span>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={addSelectedQuestions}
                            >
                              Add Selected Questions
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Questions List */}
                      <div className="border rounded-lg bg-white">
                        <div className="p-3 bg-gray-50 border-b">
                          <h5 className="font-medium">
                            Available Questions ({filteredQuestions.length})
                          </h5>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredQuestions.length === 0 ? (
                            <div className="p-4 text-center text-gray-500">
                              No questions found matching your criteria
                            </div>
                          ) : (
                            filteredQuestions.map((question) => (
                              <div
                                key={question.id}
                                className={`p-3 border-b cursor-pointer hover:bg-gray-50 ${
                                  selectedQuestionIds.has(question.id)
                                    ? "bg-blue-50 border-blue-200"
                                    : ""
                                }`}
                                onClick={() =>
                                  toggleQuestionSelection(question.id)
                                }
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={selectedQuestionIds.has(
                                      question.id
                                    )}
                                    onCheckedChange={() =>
                                      toggleQuestionSelection(question.id)
                                    }
                                    className="mt-1"
                                  />
                                  <div className="flex-1">
                                    <p className="text-sm">{question.text}</p>
                                    <div className="flex gap-2 mt-1">
                                      {question.category && (
                                        <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                                          {question.category}
                                        </span>
                                      )}
                                      {question.difficulty && (
                                        <span
                                          className={`text-xs px-2 py-1 rounded ${
                                            question.difficulty === "advanced"
                                              ? "bg-red-100 text-red-800"
                                              : question.difficulty ===
                                                "intermediate"
                                              ? "bg-yellow-100 text-yellow-800"
                                              : "bg-green-100 text-green-800"
                                          }`}
                                        >
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
                                      // Add single question immediately
                                      setCustomQuestions((prev) => [
                                        ...prev,
                                        {
                                          text: question.text,
                                          category: question.category || "general",
                                          difficulty: question.difficulty || "medium"
                                        }
                                      ]);
                                      notifySuccess(
                                        "Question added to custom questions"
                                      );
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
                </div>
              </CardContent>
            </Card>
            <Card className="mt-6">
              <CardContent className="space-y-6 p-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">Skills to Test <span className="text-red-500">*</span></h3>
                    {(skillGroups.length === 0 || !skillGroups.some(group => 
                      group.skills.some(skill => skill.trim().length > 0)
                    )) && (
                      <span className="text-sm text-red-500">At least one skill required</span>
                    )}
                  </div>
                  <Button variant="primary" onClick={addSkillGroup}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Skill Group
                  </Button>
                </div>

                <div className="space-y-4">
                  {skillGroups.map((group) => (
                    <div key={group.id} className="border rounded-lg p-4">
                      {/* Skill Group Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 flex-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleGroupExpansion(group.id)}
                            className="h-6 w-6"
                          >
                            {expandedGroups.has(group.id) ? (
                              <ChevronDownIcon className="w-4 h-4" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4" />
                            )}
                          </Button>
                          <Input
                            value={group.name}
                            onChange={(e) =>
                              updateSkillGroupName(group.id, e.target.value)
                            }
                            placeholder="Skill Group Name"
                            className="font-medium"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteSkillGroup(group.id)}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>

                      {/* Skill Group Content (Collapsible) */}
                      {expandedGroups.has(group.id) && (
                        <div className="space-y-4 pl-8">
                          {/* Skills List */}
                          <div className="space-y-2">
                            {group.skills.map((skill, skillIndex) => (
                              <div
                                key={skillIndex}
                                className="flex gap-2 items-center"
                              >
                                <Input
                                  value={skill}
                                  onChange={(e) =>
                                    updateSkillInGroup(
                                      group.id,
                                      skillIndex,
                                      e.target.value
                                    )
                                  }
                                  placeholder="Skill e.g. Wireframing"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    deleteSkillFromGroup(group.id, skillIndex)
                                  }
                                >
                                  <TrashIcon className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="primary"
                              onClick={() => addSkillToGroup(group.id)}
                            >
                              Add Skill
                            </Button>
                          </div>

                          {/* Criteria Selection */}
                          <div>
                            <h4 className="font-medium text-sm mb-2">
                              Criteria for this group
                            </h4>
                            <RadioGroup
                              value={group.skill_criteria}
                              onValueChange={(
                                value: "All Mandatory" | "At Least One" | "None"
                              ) => updateSkillGroupCriteria(group.id, value)}
                              className="flex flex-col gap-2"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="All Mandatory"
                                  id={`${group.id}-all`}
                                />
                                <Label htmlFor={`${group.id}-all`}>
                                  All skills mandatory
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="At Least One"
                                  id={`${group.id}-one`}
                                />
                                <Label htmlFor={`${group.id}-one`}>
                                  At least one mandatory
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value="None"
                                  id={`${group.id}-none`}
                                />
                                <Label htmlFor={`${group.id}-none`}>
                                  None mandatory
                                </Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {skillGroups.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    No skill groups added yet. Click "Add Skill Group" to get
                    started.
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      )}

      {/* Bottom Navigation */}
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={handleBack} disabled={step === 0}>
          Back
        </Button>

        <div className="flex gap-2">
          {step === 2 ? (
            <Button variant="primary" onClick={handleSubmit}>
              {isEditMode ? "Update Job" : "Save & Done"}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleNext}>
              Next
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