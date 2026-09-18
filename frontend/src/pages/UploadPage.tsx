import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Download,
  Clipboard,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { jobsApi, type ValidationReport } from '../lib/api';
import toast from 'react-hot-toast';

export function UploadPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'file' | 'paste'>('paste'); // Default to paste for instant convenience
  const [uploading, setUploading] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<number>(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  // Direct paste states
  const [pasteText, setPasteText] = useState('');
  const [customJobName, setCustomJobName] = useState('');

  // Live count preview for pasted text
  const detectedCount = useMemo(() => {
    if (!pasteText.trim()) return 0;
    const items = pasteText
      .split(/[\r\n,;\t]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return items.length;
  }, [pasteText]);

  // Handle file drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;

    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Only CSV, XLSX, and XLS files are supported');
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10MB limit');
      return;
    }

    setFile(f);
    setUploading(true);

    try {
      const result = await jobsApi.create(f);
      setValidation(result.validation);
      setColumns(result.columns);
      setSelectedColumn(result.selectedColumn);
      setJobId(result.job.id);
      setStep('review');
      toast.success('File parsed successfully!');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  // Handle direct paste submit
  const handleProcessPaste = async () => {
    if (!pasteText.trim()) {
      toast.error('Please paste or type at least one GitHub username or link.');
      return;
    }

    setUploading(true);
    try {
      const result = await jobsApi.createFromText(
        pasteText,
        customJobName.trim() || undefined
      );
      setValidation(result.validation);
      setColumns(result.columns);
      setSelectedColumn(0);
      setJobId(result.job.id);
      setStep('review');
      toast.success(`Processed ${result.validation.valid} valid usernames!`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Processing failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  // Quick clipboard paste button
  const handlePasteFromClipboard = async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText.trim()) {
        toast.error('Clipboard is empty');
        return;
      }
      setPasteText((prev) => (prev ? `${prev}\n${clipText}` : clipText));
      toast.success('Pasted from clipboard!');
    } catch {
      toast.error('Clipboard access was not permitted. Please paste with Ctrl+V.');
    }
  };

  const handleStartJob = () => {
    if (jobId) {
      navigate(`/jobs/${jobId}`);
    }
  };

  const downloadValidationReport = () => {
    if (!validation) return;
    const lines: string[] = ['GitHub Username Validation Report', ''];
    lines.push(`Total: ${validation.total}`);
    lines.push(`Valid: ${validation.valid}`);
    lines.push(`Invalid: ${validation.invalid}`);
    lines.push(`Duplicates: ${validation.duplicates}`);

    if (validation.invalidDetails.length > 0) {
      lines.push('', 'Invalid Entries:');
      validation.invalidDetails.forEach((d) => {
        lines.push(`  "${d.raw}" — ${d.reason}`);
      });
    }

    if (validation.duplicateValues.length > 0) {
      lines.push('', 'Duplicate Entries:');
      validation.duplicateValues.forEach((d) => {
        lines.push(`  "${d}"`);
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'validation-report.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">Import GitHub Users</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Paste a list of usernames or upload an Excel/CSV file to create a follow job.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] max-w-md">
              <button
                type="button"
                onClick={() => setMode('paste')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  mode === 'paste'
                    ? 'bg-brand-500 text-white shadow-md'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Clipboard className="w-4 h-4" />
                Direct Paste / Text
              </button>
              <button
                type="button"
                onClick={() => setMode('file')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                  mode === 'file'
                    ? 'bg-brand-500 text-white shadow-md'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Upload Spreadsheet
              </button>
            </div>

            {/* TAB 1: DIRECT PASTE */}
            {mode === 'paste' && (
              <div className="glass-card space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-[var(--text-primary)]">
                      Job Name (Optional)
                    </label>
                    <p className="text-xs text-[var(--text-muted)]">Give this list a recognizable name</p>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Core Contributors, AI Researchers"
                    value={customJobName}
                    onChange={(e) => setCustomJobName(e.target.value)}
                    className="input sm:max-w-xs text-sm"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-500" />
                      Paste GitHub Usernames or URLs
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="text-xs text-brand-500 hover:text-brand-400 font-medium inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-500/10 hover:bg-brand-500/20 transition-colors"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        Paste from Clipboard
                      </button>
                      {pasteText && (
                        <button
                          type="button"
                          onClick={() => setPasteText('')}
                          className="text-xs text-red-400 hover:text-red-300 font-medium inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={8}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`Paste usernames, @handles, or profile links here (one per line, comma-separated, or space-separated):

torvalds
@gaearon
https://github.com/octocat
yyx990803, antfu, shadcn`}
                    className="input font-mono text-sm leading-relaxed resize-y w-full"
                    disabled={uploading}
                  />

                  <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-muted)]">
                    <span>Supports: Usernames, @mentions, or full URLs (https://github.com/...)</span>
                    <span className="font-semibold text-brand-500">
                      {detectedCount} {detectedCount === 1 ? 'entry' : 'entries'} detected
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleProcessPaste}
                    disabled={uploading || detectedCount === 0}
                    className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        Validating & Creating Job...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Validate & Create Job ({detectedCount})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: FILE DROPZONE */}
            {mode === 'file' && (
              <div
                {...getRootProps()}
                className={`dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input {...getInputProps()} />
                {uploading ? (
                  <>
                    <div className="w-12 h-12 rounded-full border-4 border-brand-500/30 border-t-brand-500 animate-spin" />
                    <p className="text-[var(--text-secondary)] font-medium">Parsing file...</p>
                  </>
                ) : (
                  <>
                    <motion.div
                      className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center"
                      animate={{ y: isDragActive ? -8 : 0 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <Upload className="w-8 h-8 text-brand-500" />
                    </motion.div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-[var(--text-primary)]">
                        {isDragActive ? 'Drop your file here' : 'Drop your spreadsheet here'}
                      </p>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        CSV / XLSX / XLS supported — max 10MB
                      </p>
                    </div>
                    <button className="btn-secondary text-sm" type="button">
                      Browse Files
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2: REVIEW & VALIDATION */}
        {step === 'review' && validation && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* File info */}
            <div className="glass-card">
              <div className="flex items-center gap-3 mb-2">
                {file ? (
                  <FileSpreadsheet className="w-6 h-6 text-brand-500" />
                ) : (
                  <FileText className="w-6 h-6 text-brand-500" />
                )}
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {file?.name || customJobName.trim() || 'Directly Pasted List'}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {columns.length > 1 ? `${columns.length} columns detected` : 'Direct input'}
                  </p>
                </div>
              </div>

              {columns.length > 1 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                    Username column
                  </label>
                  <select
                    className="input"
                    value={selectedColumn}
                    onChange={(e) => setSelectedColumn(parseInt(e.target.value))}
                  >
                    {columns.map((col, i) => (
                      <option key={i} value={i}>
                        {col || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Validation summary cards */}
            <div className="glass-card">
              <h3 className="font-semibold text-[var(--text-primary)] mb-4">Validation Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
                  <p className="text-2xl font-bold text-[var(--text-primary)]">{validation.total}</p>
                  <p className="text-xs text-[var(--text-muted)]">Total Detected</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-2xl font-bold text-emerald-500">{validation.valid}</p>
                  <p className="text-xs text-emerald-500/70">Valid Usernames</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-2xl font-bold text-amber-500">{validation.duplicates}</p>
                  <p className="text-xs text-amber-500/70">Duplicates Removed</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <p className="text-2xl font-bold text-rose-500">{validation.invalid}</p>
                  <p className="text-xs text-rose-500/70">Invalid Format</p>
                </div>
              </div>

              {/* Invalid details */}
              {validation.invalidDetails.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
                  <p className="text-sm font-medium text-rose-500 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4" /> Invalid Entries ({validation.invalidDetails.length})
                  </p>
                  <ul className="space-y-1 text-xs text-[var(--text-secondary)] max-h-36 overflow-y-auto">
                    {validation.invalidDetails.map((d, i) => (
                      <li key={i}>
                        <code className="text-rose-400 bg-rose-500/10 px-1 py-0.5 rounded font-mono">
                          "{d.raw}"
                        </code>{' '}
                        — {d.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Duplicate details */}
              {validation.duplicateValues.length > 0 && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <p className="text-sm font-medium text-amber-500 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Duplicate Usernames Filtered ({validation.duplicateValues.length})
                  </p>
                  <p className="text-xs text-[var(--text-muted)] break-all">
                    {validation.duplicateValues.slice(0, 15).join(', ')}
                    {validation.duplicateValues.length > 15 &&
                      ` and ${validation.duplicateValues.length - 15} more`}
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={downloadValidationReport}
                  className="btn-secondary text-sm inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Validation Report
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setStep('upload');
                  setValidation(null);
                  setFile(null);
                }}
                className="btn-secondary text-sm"
              >
                Back / Change Input
              </button>
              <button
                onClick={handleStartJob}
                className="btn-primary text-sm inline-flex items-center gap-2"
                disabled={validation.valid === 0}
              >
                Proceed to Follow Job <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
