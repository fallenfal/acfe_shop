import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  createOrgProgramme,
  createOrgStep,
  deleteOrgStep,
  fetchOrgProgramme,
  publishOrgProgramme,
  reorderOrgSteps,
  updateOrgProgramme,
  updateOrgStep,
} from "../../api/training";
import { formatApiError } from "../../api/client";
import { MarkdownBody } from "../../components/memos/MarkdownBody";
import { ProgrammeCover } from "../../components/training/ProgrammeCover";
import { Button } from "../../components/ui/Button";
import { useLocation } from "../../contexts/LocationContext";
import { useIsCmOrAbove, usePermission } from "../../hooks/usePermission";
import { TRAINING_CATEGORIES } from "../../lib/trainingLabels";
import type { ProgrammeDetail, TrainingCategory, TrainingStep } from "../../types/training";

interface StepDraft {
  id: string;
  clientId: string;
  order: number;
  title: string;
  description: string;
  image: string | null;
  imageFile: File | null;
  video_url: string;
  requires_acknowledgement: boolean;
  tips: string;
  isNew?: boolean;
}

function stepToDraft(s: TrainingStep): StepDraft {
  return {
    id: s.id,
    clientId: s.id,
    order: s.order,
    title: s.title,
    description: s.description,
    image: s.image,
    imageFile: null,
    video_url: s.video_url || "",
    requires_acknowledgement: s.requires_acknowledgement,
    tips: s.tips || "",
  };
}

function buildStepFormData(step: StepDraft): FormData {
  const fd = new FormData();
  fd.append("title", step.title);
  fd.append("description", step.description);
  fd.append("video_url", step.video_url);
  fd.append("requires_acknowledgement", String(step.requires_acknowledgement));
  fd.append("tips", step.tips);
  if (step.imageFile) fd.append("image", step.imageFile);
  return fd;
}

function buildProgrammePayload(
  title: string,
  description: string,
  category: TrainingCategory,
  estimated_duration_minutes: number,
  is_mandatory: boolean,
  target_roles: string[],
  location_ids: string[],
) {
  return {
    title,
    description,
    category,
    estimated_duration_minutes,
    is_mandatory,
    target_roles,
    location_ids,
  };
}

export function ProgrammeBuilder() {
  const { programmeId } = useParams<{ programmeId: string }>();
  const isNew = !programmeId;
  const navigate = useNavigate();
  const { locations } = useLocation();
  const canManage = usePermission("training.create");
  const isCm = useIsCmOrAbove();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TrainingCategory>("other");
  const [, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [mandatory, setMandatory] = useState(false);
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([
    {
      id: "",
      clientId: "new-1",
      order: 1,
      title: "Step 1",
      description: "",
      image: null,
      imageFile: null,
      video_url: "",
      requires_acknowledgement: false,
      tips: "",
      isNew: true,
    },
  ]);
  const [status, setStatus] = useState<ProgrammeDetail["status"]>("draft");
  const [savedId, setSavedId] = useState<string | null>(programmeId ?? null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewStepId, setPreviewStepId] = useState<string | null>(null);
  const dragItem = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!programmeId || isNew) return;
    setLoading(true);
    try {
      const prog = await fetchOrgProgramme(programmeId);
      setTitle(prog.title);
      setDescription(prog.description);
      setCategory(prog.category);
      setCoverPreview(prog.cover_image);
      setDuration(prog.estimated_duration_minutes);
      setMandatory(prog.is_mandatory);
      setTargetRoles(prog.target_roles || []);
      setLocationIds(prog.locations || []);
      setStatus(prog.status);
      setSavedId(prog.id);
      setSteps(prog.steps.map(stepToDraft));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [programmeId, isNew]);

  useEffect(() => {
    load();
  }, [load]);

  if (!canManage || !isCm) {
    return <Navigate to="/training" replace />;
  }

  function reorderLocal(list: StepDraft[]) {
    return list.map((s, i) => ({ ...s, order: i + 1 }));
  }

  function handleDragStart(index: number) {
    dragItem.current = index;
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragItem.current === null || dragItem.current === index) return;
    setSteps((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragItem.current!, 1);
      next.splice(index, 0, removed);
      dragItem.current = index;
      return reorderLocal(next);
    });
  }

  async function handleDragEnd() {
    dragItem.current = null;
    if (savedId && steps.every((s) => s.id)) {
      try {
        await reorderOrgSteps(
          savedId,
          steps.map((s) => s.id),
        );
      } catch (e) {
        setError(formatApiError(e));
      }
    }
  }

  async function persistSteps(programmeIdVal: string) {
    const updatedSteps: StepDraft[] = [];
    for (const step of steps) {
      const fd = buildStepFormData(step);
      if (step.isNew || !step.id) {
        const created = await createOrgStep(programmeIdVal, fd);
        updatedSteps.push(stepToDraft(created));
      } else {
        const updated = await updateOrgStep(programmeIdVal, step.id, fd);
        updatedSteps.push(stepToDraft(updated));
      }
    }
    setSteps(updatedSteps);
    await reorderOrgSteps(
      programmeIdVal,
      updatedSteps.map((s) => s.id),
    );
  }

  async function saveDraft(): Promise<string | null> {
    setSaving(true);
    setError(null);
    try {
      let id = savedId;
      const payload = buildProgrammePayload(
        title,
        description,
        category,
        duration,
        mandatory,
        targetRoles,
        locationIds,
      );

      if (!id) {
        const created = await createOrgProgramme(payload);
        id = created.id;
        setSavedId(id);
        const prog = await fetchOrgProgramme(id);
        setSteps(prog.steps.map(stepToDraft));
        navigate(`/training/${id}/edit`, { replace: true });
      } else {
        await updateOrgProgramme(id, payload);
        await persistSteps(id);
      }
      return id;
    } catch (e) {
      setError(formatApiError(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    await saveDraft();
  }

  async function handlePublish() {
    const invalid = steps.some((s) => !s.title.trim() || !s.description.trim());
    if (invalid) {
      setError("Each step needs a title and description before publishing.");
      return;
    }
    const id = await saveDraft();
    if (!id) return;
    try {
      await publishOrgProgramme(id);
      navigate("/training?tab=manage");
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  function addStep() {
    setSteps((prev) =>
      reorderLocal([
        ...prev,
        {
          id: "",
          clientId: `new-${Date.now()}`,
          order: prev.length + 1,
          title: "",
          description: "",
          image: null,
          imageFile: null,
          video_url: "",
          requires_acknowledgement: false,
          tips: "",
          isNew: true,
        },
      ]),
    );
  }

  async function removeStep(clientId: string) {
    if (steps.length <= 1) return;
    const step = steps.find((s) => s.clientId === clientId);
    if (!step) return;
    if (step.id && savedId) {
      if (!confirm("Delete this step?")) return;
      try {
        await deleteOrgStep(savedId, step.id);
      } catch (e) {
        setError(formatApiError(e));
        return;
      }
    }
    setSteps((prev) => reorderLocal(prev.filter((s) => s.clientId !== clientId)));
  }

  function updateStep(clientId: string, patch: Partial<StepDraft>) {
    setSteps((prev) =>
      prev.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)),
    );
  }

  if (loading) return <p className="text-brown-600">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <Link
        to="/training?tab=manage"
        className="inline-flex items-center gap-1 text-sm text-brown-600 hover:text-amber-brand-dark"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Training
      </Link>

      <h1 className="font-display text-2xl font-bold text-brown-900">
        {isNew ? "Create programme" : "Edit programme"}
      </h1>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-cream-200 bg-white p-6">
        <h2 className="font-display text-lg font-bold text-brown-900">Programme details</h2>
        <label className="block">
          <span className="text-sm font-medium text-brown-700">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-brown-700">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            placeholder="Markdown supported"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-brown-700">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TrainingCategory)}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          >
            {TRAINING_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-brown-700">Cover image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setCoverFile(f);
                setCoverPreview(URL.createObjectURL(f));
              }
            }}
            className="mt-1 text-sm"
          />
          {coverPreview && (
            <ProgrammeCover
              coverImage={coverPreview}
              category={category}
              title={title}
              className="mt-2 h-24 rounded-lg"
            />
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-brown-700">Estimated duration (minutes)</span>
          <input
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mandatory}
            onChange={(e) => setMandatory(e.target.checked)}
          />
          <span className="text-sm text-brown-800">Mandatory for assigned staff</span>
        </label>
        <fieldset>
          <legend className="text-sm font-medium text-brown-700">Target roles (optional)</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {["staff", "content_manager"].map((role) => (
              <label key={role} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={targetRoles.includes(role)}
                  onChange={(e) => {
                    setTargetRoles((prev) =>
                      e.target.checked
                        ? [...prev, role]
                        : prev.filter((r) => r !== role),
                    );
                  }}
                />
                {role === "content_manager" ? "Content Manager" : "Staff"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-brown-700">
            Locations (empty = all locations)
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {locations.map((loc) => (
              <label key={loc.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={locationIds.includes(loc.id)}
                  onChange={(e) => {
                    setLocationIds((prev) =>
                      e.target.checked
                        ? [...prev, loc.id]
                        : prev.filter((id) => id !== loc.id),
                    );
                  }}
                />
                {loc.name}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-brown-900">Steps</h2>
        {steps.map((step, index) => (
          <div
            key={step.clientId}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className="rounded-xl border border-cream-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-2">
              <GripVertical className="h-5 w-5 cursor-grab text-brown-500" />
              <span className="text-sm font-bold text-brown-600">Step {step.order}</span>
              <button
                type="button"
                disabled={steps.length <= 1}
                onClick={() => removeStep(step.clientId)}
                className="ml-auto text-red-600 disabled:opacity-30"
                aria-label="Delete step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input
              value={step.title}
              onChange={(e) => updateStep(step.clientId, { title: e.target.value })}
              placeholder="Step title"
              className="mb-2 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm font-medium"
            />
            <textarea
              value={step.description}
              onChange={(e) => updateStep(step.clientId, { description: e.target.value })}
              placeholder="Instructions (markdown)"
              rows={4}
              className="mb-2 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            />
            {previewStepId === step.clientId && step.description && (
              <div className="mb-2 rounded-lg border border-cream-100 bg-cream-50 p-3">
                <MarkdownBody content={step.description} />
              </div>
            )}
            <button
              type="button"
              className="mb-2 text-xs text-amber-brand-dark hover:underline"
              onClick={() =>
                setPreviewStepId((id) => (id === step.clientId ? null : step.clientId))
              }
            >
              {previewStepId === step.clientId ? "Hide preview" : "Preview markdown"}
            </button>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  updateStep(step.clientId, {
                    imageFile: f,
                    image: URL.createObjectURL(f),
                  });
              }}
              className="mb-2 block text-sm"
            />
            {step.image && (
              <img src={step.image} alt="" className="mb-2 max-h-40 rounded-lg object-cover" />
            )}
            <input
              value={step.video_url}
              onChange={(e) => updateStep(step.clientId, { video_url: e.target.value })}
              placeholder="Video URL (YouTube, Vimeo…)"
              className="mb-2 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={step.requires_acknowledgement}
                onChange={(e) =>
                  updateStep(step.clientId, {
                    requires_acknowledgement: e.target.checked,
                  })
                }
              />
              Requires acknowledgement
            </label>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-brown-600">Tips (optional)</summary>
              <textarea
                value={step.tips}
                onChange={(e) => updateStep(step.clientId, { tips: e.target.value })}
                rows={2}
                className="mt-2 w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
              />
            </details>
          </div>
        ))}
        <Button variant="secondary" onClick={addStep}>
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
      </section>

      <div className="sticky bottom-4 flex flex-wrap gap-3 rounded-xl border border-cream-200 bg-white/95 p-4 shadow-lg backdrop-blur">
        <Button variant="secondary" onClick={handleSaveDraft} disabled={saving}>
          {saving ? "Saving…" : "Save Draft"}
        </Button>
        {status === "draft" && (
          <Button onClick={handlePublish} disabled={saving}>
            Publish
          </Button>
        )}
        {savedId && (
          <Button
            variant="ghost"
            onClick={() => navigate(`/training/${savedId}?preview=1`)}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
      </div>
    </div>
  );
}
