import React, { useState } from 'react';
import './App.css';
import OpticalTable from './components/OpticalTable';
import Sidebar from './components/Sidebar';
import PropertiesPanel from './components/PropertiesPanel';

function App() {
  const [components, setComponents] = useState([]);
  const [selectedCompId, setSelectedCompId] = useState(null);

  const handleSelect = (id) => {
    setSelectedCompId(id);
  };

  return (
    <div className="app-container">
      {/* Main Canvas - Underneath */}
      <div className="main-stage-wrapper">
        <OpticalTable
          components={components}
          setComponents={setComponents}
          onSelect={handleSelect}
        />
      </div>

      {/* Overlays - On top */}
      <Sidebar setComponents={setComponents} />
      <PropertiesPanel
        selectedCompId={selectedCompId}
        components={components}
        setComponents={setComponents}
      />
    </div>
  );
}

export default App;
