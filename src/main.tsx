import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (window.location.pathname.startsWith('/alexa')) {
  const AlexaSimulator = lazy(() => import('./alexa/AlexaSimulator'));
  root.render(
    <Suspense fallback={null}>
      <AlexaSimulator />
    </Suspense>,
  );
} else {
  void import('./App').then(({ default: App }) => {
    root.render(<App />);
  });
}
