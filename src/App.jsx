import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import OpticalTable from './components/OpticalTable';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';
import ComponentSearch from './components/ComponentSearch';
import { tools } from './data/tools';

function App() {
  // History State structure: { past: Array<Array<Comp>>, present: Array<Comp>, future: Array<Array<Comp>> }
  const [history, setHistory] = useState({
    past: [],
    present: [],
    future: []
  });

  // Theme State
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const [selectedCompId, setSelectedCompId] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [showSearch, setShowSearch] = useState(false);

  // Helper to access current components easily
  const components = history.present;

  // --- History Management ---

  // Update components with optional commit to history
  // commit = true: Save current state to past before updating
  // commit = false: Transient update (drag/slide), don't clutter history
  const updateComponents = useCallback((newComponents, commit = true) => {
    setHistory(prev => {
      if (commit) {
        // Limit history size to 50 steps
        const newPast = [...prev.past, prev.present];
        if (newPast.length > 50) newPast.shift();

        return {
          past: newPast,
          present: newComponents,
          future: [] // Clear future on new branch
        };
      } else {
        return {
          ...prev,
          present: newComponents
        };
      }
    });
  }, []);

  // Checkpoint: Save current state to past without changing present
  // Used before starting a transient action (drag start)
  const saveCheckpoint = useCallback(() => {
    setHistory(prev => {
      const newPast = [...prev.past, prev.present];
      if (newPast.length > 50) newPast.shift();
      return {
        ...prev,
        past: newPast,
        future: []
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture
      };
    });
  }, []);

  // --- Clipboard & Edit Actions ---

  const copy = useCallback(() => {
    if (!selectedCompId) return;
    const comp = history.present.find(c => c.id === selectedCompId);
    if (comp) {
      setClipboard(comp);
    }
  }, [selectedCompId, history.present]);

  const paste = useCallback(() => {
    if (!clipboard) return;
    const newComp = {
      ...clipboard,
      id: uuidv4(),
      position: { x: clipboard.position.x + 20, y: clipboard.position.y + 20 }
    };
    // Commit the paste
    updateComponents([...history.present, newComp], true);
    setSelectedCompId(newComp.id);
  }, [clipboard, history.present, updateComponents]);

  const deleteSelected = useCallback(() => {
    if (selectedCompId) {
      const newComps = history.present.filter(c => c.id !== selectedCompId);
      updateComponents(newComps, true);
      setSelectedCompId(null);
    }
  }, [selectedCompId, history.present, updateComponents]);

  const rotateSelected = useCallback(() => {
    if (selectedCompId) {
      const newComps = history.present.map(c => {
        if (c.id === selectedCompId) {
          return { ...c, rotation: (c.rotation + 45) % 360 };
        }
        return c;
      });
      updateComponents(newComps, true);
    }
  }, [selectedCompId, history.present, updateComponents]);

  // --- Keyboard Shortcuts ---

  const addComponent = (type) => {
    const tool = tools.find(t => t.id === type);
    const defaultParams = tool?.params || {};

    // Add to center of view (approximate if viewBox unknown here, but we can default to center 0,0 or just offset)
    // Sidebar adds to 400,300. We'll duplicate logic or better yet, make it relative to view.
    // Since App doesn't track viewBox (OpticalTable does), we'll add to a safe default location (0,0) or last mouse pos?
    // Let's add to (0,0) for now, user can move it. Or better: (100, 100) to be visible.

    const newComp = {
      id: uuidv4(),
      type,
      position: { x: 0, y: 0 }, // Center-ish
      rotation: ['mirror', 'lens', 'aom', 'beamsplitter', 'iris', 'cavity', 'hwp', 'qwp', 'polarizer', 'pbs'].includes(type) ? 90 : 0,
      params: { ...defaultParams }
    };

    updateComponents([...history.present, newComp], true);
    setSelectedCompId(newComp.id);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Input fields should ignore shortcuts (except maybe Ctrl+Z/C/V which browser handles, but for global app state we might want to override or let pass)
      // Usually good to block typical shortcuts if focusing an input
      // Input fields should ignore shortcuts (except maybe Ctrl+Z/C/V which browser handles, but for global app state we might want to override or let pass)
      // Usually good to block typical shortcuts if focusing an input
      // EXCEPTION: If Esc is pressed, we might want to handle it even in input?
      // ComponentSearch handles its own input keydown, but we want to open it globally.
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Toggle Search with '/'
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            undo();
            break;
          case 'y':
            e.preventDefault();
            redo();
            break;
          case 'c':
            e.preventDefault();
            copy();
            break;
          case 'v':
            e.preventDefault();
            paste();
            break;
          default:
            break;
        }
      } else {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          deleteSelected();
        }
        if (e.key.toLowerCase() === 'r') {
          rotateSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copy, paste, deleteSelected, rotateSelected]);


  // Wrapper for child components to use setComponents interface but wired to history
  // NOTE: children expect (prev => ...) or value.
  // We need to adapt it. 
  const setComponentsAdapter = (arg, commit = true) => {
    if (typeof arg === 'function') {
      updateComponents(arg(history.present), commit);
    } else {
      updateComponents(arg, commit);
    }
  };

  const handleSelect = (id) => {
    setSelectedCompId(id);
  };

  return (
    <div className="app-container">
      {/* Main Canvas - Underneath */}
      <div className="main-stage-wrapper">
        <OpticalTable
          components={components}
          setComponents={setComponentsAdapter}
          onSelect={handleSelect}
          saveCheckpoint={saveCheckpoint}
        />
      </div>

      {/* Overlays - On top */}
      <Sidebar
        setComponents={(fn) => setComponentsAdapter(fn, true)}
        toggleTheme={toggleTheme}
        theme={theme}
      />
      <PropertiesPanel
        selectedCompId={selectedCompId}
        components={components}
        setComponents={setComponentsAdapter}
        saveCheckpoint={saveCheckpoint}
      />
      <ComponentSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={addComponent}
      />
    </div>
  );
}

export default App;
