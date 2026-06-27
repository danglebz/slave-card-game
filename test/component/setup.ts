// setup สำหรับ component test (project 'dom') — matchers ของ jest-dom + cleanup หลังแต่ละเทสต์
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
