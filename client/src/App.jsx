import { useAuth } from './context/AuthContext.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ChatPage from './pages/ChatPage.jsx';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="splash">
        <div className="splash-logo">💬</div>
        <p>ChatApp</p>
      </div>
    );
  }

  return user ? <ChatPage /> : <AuthPage />;
}
