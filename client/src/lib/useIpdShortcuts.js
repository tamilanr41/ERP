import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Section 48 — IPD keyboard shortcuts.
 *   Ctrl/Cmd + K   global patient search (command palette)
 *   Alt + A        new admission
 *   Alt + B        bed board
 *   Alt + V        vitals
 *   Alt + D        doctor visit
 *   Alt + M        medication
 *   Alt + F        final bill
 *   Esc            close the top-most overlay
 *
 * Alt shortcuts are ignored while the operator is typing in a field, except
 * Alt+A which is always available so admission is never blocked.
 */
export const SHORTCUTS = [
  { keys: 'Ctrl + K', label: 'Global patient search', action: 'search' },
  { keys: 'Alt + A', label: 'New admission', action: 'admit' },
  { keys: 'Alt + B', label: 'Bed board', action: 'beds' },
  { keys: 'Alt + V', label: 'Vitals', action: 'vitals' },
  { keys: 'Alt + D', label: 'Doctor visit', action: 'visit' },
  { keys: 'Alt + M', label: 'Medication', action: 'medication' },
  { keys: 'Alt + F', label: 'Final bill', action: 'final-bill' },
  { keys: 'Esc', label: 'Close modal / drawer', action: 'escape' },
];

const TAB_FOR_ACTION = {
  vitals: 'vitals',
  visit: 'visits',
  medication: 'medications',
  'final-bill': 'discharge',
};

const isTyping = (el) => !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);

export function useIpdShortcuts({ onOpenSearch, enabled = true } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const locRef = useRef(location.pathname);
  locRef.current = location.pathname;

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e) => {
      const key = e.key.toLowerCase();

      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        onOpenSearch?.();
        return;
      }

      if (e.key === 'Escape') {
        // let the focused component close itself first
        const openOverlay = document.querySelector('[data-overlay-open="true"]');
        if (openOverlay) {
          openOverlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        }
        document.dispatchEvent(new CustomEvent('ipd:escape'));
        return;
      }

      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      if (key === 'a') {
        e.preventDefault();
        navigate('/ipd/admissions?new=1');
        return;
      }

      if (isTyping(e.target) || e.target?.isContentEditable) return;

      if (key === 'b') {
        e.preventDefault();
        navigate('/ipd/wards');
        toast.message('Bed board');
        return;
      }

      const tab = TAB_FOR_ACTION[key];
      if (!tab) return;

      e.preventDefault();
      const match = locRef.current.match(/^\/ipd\/admission\/([^/?#]+)/);
      if (match) {
        navigate(`/ipd/admission/${match[1]}?tab=${tab}`);
        return;
      }
      // no admission open — go to the admission register with the intent queued
      navigate(`/ipd/admissions?focus=${tab}`);
      toast.message(`Open a patient to record ${key === 'v' ? 'vitals' : key === 'd' ? 'a doctor visit' : key === 'm' ? 'medication' : 'the final bill'}`);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, navigate, onOpenSearch]);
}

export default useIpdShortcuts;
