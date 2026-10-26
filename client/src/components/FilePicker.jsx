import React, { useRef, useState } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from '../lib/hashing';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** File input with drag-and-drop. Hashing is done by the parent. */
const FilePicker = ({ id, file, onChange, disabled, label = 'Certificate file' }) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files) => {
    if (disabled) return;
    onChange(files?.[0] ?? null);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`relative rounded-xl border-2 border-dashed p-5 text-center transition-all ${
          dragging ? 'border-cyan-500 bg-cyan-50' : 'border-slate-200 bg-slate-50'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
        {file ? (
          <div className="text-sm">
            <p className="font-bold text-slate-800 break-all">{file.name}</p>
            <p className="text-slate-500">{formatBytes(file.size)}</p>
            <div className="mt-2 flex justify-center gap-3">
              <button type="button" className="text-cyan-700 font-bold" onClick={() => inputRef.current?.click()} disabled={disabled}>
                Change
              </button>
              <button type="button" className="text-slate-500 font-bold" onClick={() => onChange(null)} disabled={disabled}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">
            <button type="button" className="font-bold text-cyan-700 hover:text-cyan-900" onClick={() => inputRef.current?.click()} disabled={disabled}>
              Choose a file
            </button>{' '}
            or drop it here
            <p className="text-xs text-slate-400 mt-1">PDF, PNG or JPEG · up to {MAX_FILE_BYTES / (1024 * 1024)} MB · hashed in your browser, never uploaded</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FilePicker;
