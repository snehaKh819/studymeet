import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Home from './Home';
import Register from './Register';
import Login from './Login';
import Dashboard from './Dashboard';
import ProtectedRoute from './ProtectedRoute';
import Room from './Room';
import CodeEditor from './CodeEditor/CodeEditor';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/workspaces"
          element={
            <ProtectedRoute>
              <CodeEditor />
            </ProtectedRoute>
          }
        />

        <Route
          path="/room/:roomId"
          element={
            <ProtectedRoute>
              <Room />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;