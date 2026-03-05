import { MessageSquare, X, Send } from 'lucide-react';
import { useState } from 'react';
import { useEvidenceStore, type EvidenceNote } from '../../store/evidenceStore';

const EMPTY_NOTES: EvidenceNote[] = [];

interface NotesPopoverProps {
  evidenceItemId: string;
}

export function NotesPopover({ evidenceItemId }: NotesPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const notes = useEvidenceStore((s) => s.notes[evidenceItemId]) ?? EMPTY_NOTES;
  const addNote = useEvidenceStore((s) => s.addNote);
  const removeNote = useEvidenceStore((s) => s.removeNote);

  const handleAdd = () => {
    if (!text.trim()) return;
    addNote(evidenceItemId, text.trim());
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-colors ${
          notes.length > 0
            ? 'bg-gray-100 text-gray-700 border border-gray-300'
            : 'bg-gray-50 text-gray-400 border border-gray-200 hover:text-gray-600'
        }`}
        title={notes.length > 0 ? `${notes.length} note(s)` : 'Add note'}
      >
        <MessageSquare size={10} />
        {notes.length > 0 && notes.length}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600">Notes</span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>

          {notes.length > 0 && (
            <div className="max-h-40 overflow-y-auto">
              {notes.map((note) => (
                <div key={note.id} className="px-3 py-2 border-b border-gray-50 group">
                  <p className="text-xs text-gray-600">{note.text}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-300">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => removeNote(evidenceItemId, note.id)}
                      className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-2 flex items-center gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note..."
              className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <button
              onClick={handleAdd}
              disabled={!text.trim()}
              className="p-1.5 rounded bg-gray-700 text-white disabled:opacity-30 hover:bg-gray-800"
            >
              <Send size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
