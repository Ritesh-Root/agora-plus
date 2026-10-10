import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const path = window.location.pathname;
// Replays (`?replay=name`) are office recordings, so they open there too.
const office = path === '/office' || path === '/office/' || new URLSearchParams(window.location.search).has('replay');

if (office) {
  void import('./App').then(({ default: App }) => {
    root.render(<App />);
  });
} else {
  document.title = 'AGORA+ Home';
  const HomePage = lazy(() => import('./home/HomePage'));
  root.render(
    <Suspense fallback={<div className="min-h-dvh bg-[#f4f0e6]" />}>
      <HomePage />
    </Suspense>,
  );
}
