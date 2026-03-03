"use client";

import React, { useEffect, useState } from "react";
import { PlusIcon, PencilIcon, TrashIcon } from "lucide-react";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Question {
  id: number;
  text: string;
  category: string;
  difficulty: string;
  created_at?: string;
  updated_at?: string;
}

const API_BASE = `${process.env.NEXT_PUBLIC_API_BASE_URL}`;

const QuestionsBank: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [questionText, setQuestionText] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("basic");

  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(
    null
  );

  // Fetch questions
  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/questions/`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("❌ Failed to fetch questions:", text);
        notifyError("Failed to fetch questions");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setQuestions(data);
      setLoading(false);
    } catch (err: any) {
      console.error("❌ Network error fetching questions:", err);
      notifyError("Network error fetching questions");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const validateForm = (): boolean => {
    if (!questionText.trim()) {
      notifyError("Question text is required");
      return false;
    }

    if (!category.trim()) {
      notifyError("Category is required");
      return false;
    }

    if (!difficulty) {
      notifyError("Difficulty is required");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    // Validate form using notifications
    if (!validateForm()) {
      return;
    }

    setSaving(true);

    // Auto-generate ID for new questions
    const generateNewId = () => {
      if (questions.length === 0) return 1;
      const maxId = Math.max(...questions.map((q) => q.id));
      return maxId + 1;
    };

    const payload = {
      id: selectedQuestion ? selectedQuestion.id : generateNewId(),
      text: questionText,
      category: category,
      difficulty: difficulty,
    };

    const url = selectedQuestion
      ? `${API_BASE}/questions/${selectedQuestion.id}`
      : `${API_BASE}/questions/`;

    const method = selectedQuestion ? "PUT" : "POST";

    console.log("Saving question →", { url, method, payload });

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Handle server errors
      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ API error:", errorText);

        if (res.status === 422) {
          const errorData = JSON.parse(errorText);
          if (errorData.detail && Array.isArray(errorData.detail)) {
            errorData.detail.forEach((error: any) => {
              const errorMsg = error.msg || JSON.stringify(error);
              notifyError(errorMsg);
            });
          } else {
            notifyError(`Validation failed: ${JSON.stringify(errorData)}`);
          }
        } else {
          notifyError(`Server error: ${errorText}`);
        }
        setSaving(false);
        return;
      }

      const data = await res.json();
      console.log("✅ Success:", data);

      if (selectedQuestion) {
        setQuestions((prev) =>
          prev.map((q) => (q.id === selectedQuestion.id ? data : q))
        );
        notifySuccess("Question updated successfully!");
      } else {
        setQuestions((prev) => [...prev, data]);
        notifySuccess("Question added successfully!");
      }

      resetModal();
      setSaving(false);
    } catch (err: any) {
      console.error("❌ Network error:", err);
      notifyError(`Network error: ${err.message}`);
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this question?")) return;
    console.log("Deleting question →", `${API_BASE}/questions/${id}`);

    try {
      const res = await fetch(`${API_BASE}/questions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("❌ Delete error:", text);
        notifyError("Failed to delete question");
        return;
      }

      setQuestions((prev) => prev.filter((q) => q.id !== id));
      notifySuccess("Question deleted successfully!");
    } catch (err: any) {
      console.error("❌ Network error deleting question:", err);
      notifyError("Network error deleting question");
    }
  };

  const resetModal = () => {
    setQuestionText("");
    setCategory("");
    setDifficulty("basic");
    setSelectedQuestion(null);
    setIsOpen(false);
    setSaving(false);
  };

  const openEditModal = (q: Question) => {
    setSelectedQuestion(q);
    setQuestionText(q.text);
    setCategory(q.category);
    setDifficulty(q.difficulty);
    setIsOpen(true);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">
          Questions Bank
        </h1>
        <Button size="sm" onClick={() => setIsOpen(true)}>
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Question
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-lg shadow border bg-gray-100 dark:bg-gray-900"
            >
              <Skeleton className="h-4 w-1/3 mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <p className="text-center text-gray-500">No questions found.</p>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <div
              key={q.id}
              className="flex items-start justify-between p-4 bg-white rounded-lg shadow border dark:bg-gray-900"
            >
              <div className="flex-1">
                <p className="text-gray-800 dark:text-white mb-2">{q.text}</p>
                <p className="text-xs text-gray-500">
                  Category: <span className="font-semibold">{q.category}</span>{" "}
                  | Difficulty:{" "}
                  <span className="font-semibold">{q.difficulty}</span>
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditModal(q)}
                >
                  <PencilIcon className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(q.id)}
                >
                  <TrashIcon className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          aria-describedby="question-dialog-description"
          className="max-w-[600px]"
        >
          <DialogHeader>
            <DialogTitle>
              {selectedQuestion ? "Edit Question" : "Add Question"}
            </DialogTitle>
            <DialogDescription id="question-dialog-description">
              {selectedQuestion
                ? "Update the details of the question below."
                : "Fill in the details to add a new question."}
            </DialogDescription>
          </DialogHeader>

          <div className="mb-4">
            <Label
              htmlFor="questionText"
              className="block text-sm font-medium mb-1"
            >
              Question *
            </Label>
            <Textarea
              id="questionText"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={6}
              placeholder="Enter your question here..."
            />
          </div>

          <div className="mb-4">
            <Label
              htmlFor="category"
              className="block text-sm font-medium mb-1"
            >
              Category *
            </Label>
            <Input
              id="category"
              placeholder="Enter category (e.g., JavaScript, React, Python)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <Label
              htmlFor="difficulty"
              className="block text-sm font-medium mb-1"
            >
              Difficulty *
            </Label>
            <Select
              value={difficulty}
              onValueChange={(val) => setDifficulty(val)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : selectedQuestion ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuestionsBank;
