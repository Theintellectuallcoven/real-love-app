import { useState } from 'react';
import SwipeScreen from './SwipeScreen';
import SignupScreen from './SignupScreen';

function App() {
  const [screen, setScreen] = useState('login');

  if (screen === 'signup') {
    return (
      <div style={{ background: '#0a0808', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button onClick={() => setScreen('login')} style={{ background: 'none', border: 'none', color: '#c9a24d', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>
            Back to Sign In
          </button>
        </div>
        <SignupScreen />
      </div>
    );
  }

  return <SwipeScreen onGoToSignup={() => setScreen('signup')} />;
}

export default App;
