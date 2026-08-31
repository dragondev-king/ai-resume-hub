import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import BoldMarkupText from '../components/BoldMarkupText';
import {
  extractFromActiveTab,
  generateAnswer,
  generateResume,
  getTailorCompanyNamesForProfile,
  type GeneratedResume,
} from '../lib/api';
import { buildResumeFileName, downloadResumeDocx, listExtTemplates } from '../lib/downloadDocx';
import { downloadResumePdf } from '../lib/downloadPdf';
import type { ExtensionSettings } from '../lib/settings';
import type { AppUser, Profile } from '../lib/supabase';

type Props = {
  settings: ExtensionSettings;
  supabase: SupabaseClient;
  user: AppUser;
  profiles: Profile[];
  profilesError?: string;
  onRefreshProfiles: () => void;
  onSignOut: () => void;
};

type AppQuestion = {
  id: string;
  question: string;
  answer?: string;
};

export default function GeneratorPage({
  settings,
  supabase,
  user,
  profiles,
  profilesError,
  onRefreshProfiles,
  onSignOut,
}: Props) {
  const templates = useMemo(() => listExtTemplates(), []);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionLink, setJobDescriptionLink] = useState('');
  const [provider, setProvider] = useState<'openai' | 'claude'>('openai');
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [resume, setResume] = useState<GeneratedResume | null>(null);
  const [questions, setQuestions] = useState<AppQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  /** Preview by default; Edit toggles the editable fields. */
  const [isEditing, setIsEditing] = useState(false);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId) || null,
    [profiles, selectedProfileId]
  );

  useEffect(() => {
    if (!selectedProfileId && profiles.length === 1) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [profiles, selectedProfileId]);

  useEffect(() => {
    chrome.storage.local.get(['lastCapture'], (result) => {
      const last = result.lastCapture as
        | { jobDescription?: string; jobDescriptionLink?: string }
        | undefined;
      if (!last) return;
      if (last.jobDescription) setJobDescription(last.jobDescription);
      if (last.jobDescriptionLink) setJobDescriptionLink(last.jobDescriptionLink);
    });
  }, []);

  const updateResume = (patch: Partial<GeneratedResume>) => {
    setResume((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateExperience = (
    index: number,
    patch: Partial<GeneratedResume['experience'][number]>
  ) => {
    setResume((prev) => {
      if (!prev) return prev;
      const experience = prev.experience.map((exp, i) =>
        i === index ? { ...exp, ...patch } : exp
      );
      return { ...prev, experience };
    });
  };

  const onCapture = async () => {
    setCapturing(true);
    setError('');
    try {
      const payload = await extractFromActiveTab();
      setJobDescription(payload.jobDescription);
      setJobDescriptionLink(payload.jobDescriptionLink);
      await chrome.storage.local.set({ lastCapture: payload });
    } catch (err: any) {
      setError(err?.message || 'Capture failed');
    } finally {
      setCapturing(false);
    }
  };

  const onGenerate = async () => {
    if (!selectedProfile) {
      setError('Select an assigned profile.');
      return;
    }
    if (!jobDescription.trim()) {
      setError('Paste or capture a job description.');
      return;
    }
    setLoading(true);
    setError('');
    setStatus('');
    setResume(null);
    setQuestions([]);
    try {
      const generated = await generateResume(
        settings,
        selectedProfile,
        jobDescription.trim(),
        provider
      );
      setResume(generated);
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.message || 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const assertCanSave = async () => {
    if (!selectedProfile || !resume) {
      throw new Error('Select a profile and generate a resume first.');
    }

    const duplicateCheckEnabled = selectedProfile.check_duplicate_applications !== false;
    const companyName = (resume.companyName || '').trim();
    if (!duplicateCheckEnabled || !companyName) return;

    const { data: canApply, error: checkError } = await supabase.rpc('can_apply_to_company', {
      p_profile_id: selectedProfile.id,
      p_company_name: companyName,
    });

    if (checkError) {
      throw new Error(checkError.message || 'Could not check if this application can be saved.');
    }

    if (!canApply) {
      throw new Error(
        `This profile already has an active application to ${companyName}. Save was blocked — download was not started.`
      );
    }
  };

  const saveApplication = async (fileName: string) => {
    if (!selectedProfile || !resume) return;
    const { error: saveError } = await supabase.rpc('create_job_application', {
      p_profile_id: selectedProfile.id,
      p_bidder_id: user.id,
      p_job_title: resume.jobTitle || '',
      p_job_description: jobDescription,
      p_company_name: resume.companyName || '',
      p_job_description_link: jobDescriptionLink || null,
      p_resume_file_name: fileName,
      p_generated_summary: resume.summary,
      p_generated_experience: resume.experience,
      p_generated_skills: resume.skills,
      p_metadata: {
        resumeTemplateId: selectedTemplateId,
        tailorCompanyNames: getTailorCompanyNamesForProfile(selectedProfile),
      },
    });
    if (saveError) {
      throw new Error(saveError.message || 'Failed to save application');
    }
  };

  const exportFile = async (format: 'docx' | 'pdf') => {
    if (!resume || !selectedProfile) return;
    const omitLinkedIn = getTailorCompanyNamesForProfile(selectedProfile);
    if (format === 'docx') {
      await downloadResumeDocx(selectedProfile, resume, selectedTemplateId, !omitLinkedIn);
    } else {
      await downloadResumePdf(selectedProfile, resume, selectedTemplateId, !omitLinkedIn);
    }
  };

  /** Check eligibility → save to DB → only then download. */
  const onSaveAndDownload = async (format: 'docx' | 'pdf') => {
    if (!resume || !selectedProfile) return;
    const actionKey = `save-${format}`;
    setDownloading(actionKey);
    setError('');
    setStatus('');
    try {
      await assertCanSave();
      const fileName = buildResumeFileName(selectedProfile, resume, format);
      await saveApplication(fileName);
      await exportFile(format);
      setStatus(`Saved to applications and downloaded ${format.toUpperCase()}.`);
    } catch (err: any) {
      setError(err?.message || 'Save & download failed');
    } finally {
      setDownloading(null);
    }
  };

  /** Download file only — does not write to the database. */
  const onDownloadOnly = async (format: 'docx' | 'pdf') => {
    if (!resume || !selectedProfile) return;
    const actionKey = `dl-${format}`;
    setDownloading(actionKey);
    setError('');
    setStatus('');
    try {
      await exportFile(format);
      setStatus(`Downloaded ${format.toUpperCase()} (not saved).`);
    } catch (err: any) {
      setError(err?.message || 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  const onAddQuestion = async () => {
    const q = newQuestion.trim();
    if (!q || !resume || !selectedProfile) return;
    const id = String(Date.now());
    setQuestions((prev) => [...prev, { id, question: q }]);
    setNewQuestion('');
    setAnsweringId(id);
    setError('');
    try {
      const result = await generateAnswer(
        settings,
        selectedProfile,
        q,
        jobDescription,
        resume
      );
      setQuestions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, answer: result.content } : item))
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to generate answer');
    } finally {
      setAnsweringId(null);
    }
  };

  const onRegenerateAnswer = async (id: string) => {
    const item = questions.find((q) => q.id === id);
    if (!item || !resume || !selectedProfile) return;
    setAnsweringId(id);
    setError('');
    try {
      const result = await generateAnswer(
        settings,
        selectedProfile,
        item.question,
        jobDescription,
        resume
      );
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, answer: result.content } : q))
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to generate answer');
    } finally {
      setAnsweringId(null);
    }
  };

  const onCopyAnswer = async (id: string, answer?: string) => {
    if (!answer?.trim()) return;
    await navigator.clipboard.writeText(answer);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  return (
    <div className="shell">
      <header className="header row-between">
        <div>
          <h1>Generator</h1>
          <p className="muted">
            {user.first_name || user.email} · {user.role}
          </p>
        </div>
        <div className="header-actions">
          <button className="link" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="stack">
        <label>
          Assigned profile
          <div className="row">
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
            >
              <option value="">Choose a profile…</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.first_name} {profile.last_name}
                  {profile.title ? ` (${profile.title})` : ''}
                </option>
              ))}
            </select>
            <button className="secondary" type="button" onClick={onRefreshProfiles}>
              Refresh
            </button>
          </div>
        </label>

        {profilesError ? <p className="error">{profilesError}</p> : null}
        {!profilesError && profiles.length === 0 ? (
          <p className="hint">No profiles assigned to you yet. Ask a manager to assign one.</p>
        ) : null}

        {selectedProfile && getTailorCompanyNamesForProfile(selectedProfile) ? (
          <p className="hint accent">
            Company/role tailoring is enabled for this profile — the two most recent employers
            will be replaced with peer companies and role titles will use a junior→senior ladder.
          </p>
        ) : null}

        <label>
          Resume template
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Job link
          <input
            type="url"
            value={jobDescriptionLink}
            onChange={(e) => setJobDescriptionLink(e.target.value)}
            placeholder="https://…"
          />
        </label>

        <label>
          Job description
          <textarea
            rows={8}
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste the JD, or capture from the current tab…"
          />
        </label>

        <label>
          AI provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'openai' | 'claude')}
          >
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
          </select>
        </label>

        <div className="row">
          <button className="secondary" type="button" onClick={onCapture} disabled={capturing}>
            {capturing ? 'Capturing…' : 'Capture from page'}
          </button>
          <button
            className="primary"
            type="button"
            onClick={onGenerate}
            disabled={loading || !selectedProfileId || !jobDescription.trim()}
          >
            {loading ? 'Generating…' : 'Generate resume'}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {status ? <p className="hint accent">{status}</p> : null}
      </section>

      {resume ? (
        <section className="result stack">
          <div className="row-between">
            <h2>{isEditing ? 'Edit resume' : 'Resume preview'}</h2>
            <button
              className="secondary"
              type="button"
              onClick={() => setIsEditing((v) => !v)}
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
          </div>

          <div className="stack download-actions">
            <p className="muted tiny">Save &amp; Download (checks duplicates, then saves, then downloads)</p>
            <div className="row">
              <button
                className="primary"
                type="button"
                onClick={() => onSaveAndDownload('docx')}
                disabled={downloading !== null}
              >
                {downloading === 'save-docx' ? 'Saving…' : 'Save & Download DOCX'}
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => onSaveAndDownload('pdf')}
                disabled={downloading !== null}
              >
                {downloading === 'save-pdf' ? 'Saving…' : 'Save & Download PDF'}
              </button>
            </div>
            <p className="muted tiny">Download only (file only — not saved to applications)</p>
            <div className="row">
              <button
                className="secondary"
                type="button"
                onClick={() => onDownloadOnly('docx')}
                disabled={downloading !== null}
              >
                {downloading === 'dl-docx' ? 'Downloading…' : 'Download DOCX'}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => onDownloadOnly('pdf')}
                disabled={downloading !== null}
              >
                {downloading === 'dl-pdf' ? 'Downloading…' : 'Download PDF'}
              </button>
            </div>
          </div>

          <div className="job-target">
            <p className="job-target-label">Target from job description</p>
            {isEditing ? (
              <div className="job-target-fields">
                <label>
                  Role name
                  <input
                    className="job-target-input"
                    value={resume.jobTitle || ''}
                    onChange={(e) => updateResume({ jobTitle: e.target.value })}
                    placeholder="Role / job title"
                  />
                </label>
                <label>
                  Company name
                  <input
                    className="job-target-input"
                    value={resume.companyName || ''}
                    onChange={(e) => updateResume({ companyName: e.target.value })}
                    placeholder="Company"
                  />
                </label>
              </div>
            ) : (
              <>
                <h3 className="job-target-role">{resume.jobTitle || 'Role not extracted'}</h3>
                <p className="job-target-company">{resume.companyName || 'Company not extracted'}</p>
              </>
            )}
          </div>

          {isEditing ? (
            <>
              <label>
                Summary
                <textarea
                  rows={5}
                  value={resume.summary}
                  onChange={(e) => updateResume({ summary: e.target.value })}
                />
              </label>

              <label>
                Skills (comma-separated)
                <textarea
                  rows={3}
                  value={resume.skills.join(', ')}
                  onChange={(e) =>
                    updateResume({
                      skills: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>

              <div className="card stack">
                <h3>Experience</h3>
                {resume.experience.map((exp, index) => (
                  <div key={index} className="exp-edit stack">
                    <p className="muted tiny">Role {index + 1}</p>
                    <label>
                      Position / role title
                      <input
                        value={exp.position}
                        onChange={(e) => updateExperience(index, { position: e.target.value })}
                      />
                    </label>
                    <label>
                      Company
                      <input
                        value={exp.company}
                        onChange={(e) => updateExperience(index, { company: e.target.value })}
                      />
                    </label>
                    <div className="row">
                      <label>
                        Start
                        <input
                          value={exp.start_date}
                          onChange={(e) =>
                            updateExperience(index, { start_date: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        End
                        <input
                          value={exp.end_date}
                          onChange={(e) => updateExperience(index, { end_date: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Bullet points (one per line; keep {'<b>'}tags for bold skills)
                      <textarea
                        rows={6}
                        value={exp.descriptions.join('\n')}
                        onChange={(e) =>
                          updateExperience(index, {
                            descriptions: e.target.value
                              .split('\n')
                              .map((line) => line.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="card">
                <h3>Summary</h3>
                <p>
                  <BoldMarkupText text={resume.summary} />
                </p>
              </div>

              <div className="card">
                <h3>Skills</h3>
                <p>
                  <BoldMarkupText text={resume.skills.join(', ')} />
                </p>
              </div>

              <div className="card stack">
                <h3>Experience</h3>
                {resume.experience.map((exp, index) => (
                  <div key={index} className="exp">
                    <p className="exp-title">
                      {exp.position} @ {exp.company}
                    </p>
                    <p className="muted tiny">
                      {exp.start_date} – {exp.end_date}
                    </p>
                    <ul>
                      {exp.descriptions.map((d, i) => (
                        <li key={i}>
                          <BoldMarkupText text={d} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="card stack">
            <h3>Application answers</h3>
            <label>
              Question
              <textarea
                rows={3}
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="e.g. Why do you want this role?"
              />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={onAddQuestion}
              disabled={!newQuestion.trim() || answeringId !== null}
            >
              {answeringId ? 'Generating answer…' : 'Generate answer'}
            </button>

            {questions.map((q) => (
              <div key={q.id} className="qa stack">
                <p className="exp-title">{q.question}</p>
                <textarea
                  rows={4}
                  value={q.answer || ''}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((item) =>
                        item.id === q.id ? { ...item, answer: e.target.value } : item
                      )
                    )
                  }
                  placeholder={answeringId === q.id ? 'Generating…' : 'Answer'}
                />
                <div className="row">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => onCopyAnswer(q.id, q.answer)}
                    disabled={!q.answer?.trim()}
                  >
                    {copiedId === q.id ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => onRegenerateAnswer(q.id)}
                    disabled={answeringId !== null}
                  >
                    Regenerate
                  </button>
                  <button
                    className="link"
                    type="button"
                    onClick={() =>
                      setQuestions((prev) => prev.filter((item) => item.id !== q.id))
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
